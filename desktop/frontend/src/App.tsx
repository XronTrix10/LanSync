import { useCallback, useEffect, useRef, useState } from "react";
import {
  AcceptConnection,
  CancelTransfers,
  Disconnect,
  DownloadFile,
  DownloadFolder,
  GetDeviceName,
  GetHomeDir,
  GetLocalIPs,
  GetRemoteFiles,
  GetSessionToken,
  GetSharedDir,
  IdentifyDevice,
  MakeDirectory,
  PushFolderToAndroid,
  PushToAndroid,
  RejectConnection,
  RequestConnection,
  SaveDeviceName,
  SaveSharedDir,
  SelectDirectory,
  SelectFiles,
  ShareClipboardText,
} from "../wailsjs/go/main/App";
import { EventsOff, EventsOn, Environment } from "../wailsjs/runtime/runtime";

import { ConnectionRequestModal } from "./components/ConnectionRequestModal";
import { FileBrowser } from "./components/FileBrowser";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { ToastContainer } from "./components/ToastContainer";
import { TransferDrawer } from "./components/TransferDrawer";
import type {
  ConnectionRequest,
  Device,
  FileInfo,
  Toast,
  TransferProgress,
} from "./types";

export default function App() {
  const [os, setOs] = useState("");
  const [localIPs, setLocalIPs] = useState<string[]>(["Loading..."]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceIP, setActiveDeviceIP] = useState<string | null>(null);
  const [newDeviceIP, setNewDeviceIP] = useState<string>("");
  const [sharedDir, setSharedDir] = useState("");
  const [homeDir, setHomeDir] = useState("");
  const [pendingRequest, setPendingRequest] =
    useState<ConnectionRequest | null>(null);
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);

  const [currentPath, setCurrentPath] = useState<string>("/");
  const [parentPath, setParentPath] = useState<string>("");
  const [files, setFiles] = useState<FileInfo[]>([]);

  const [activeTransfers, setActiveTransfers] = useState<
    Record<string, TransferProgress>
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [deviceName, setDeviceName] = useState("");

  // ── GLOBAL STATE REF (Cross-Platform Savior) ──
  // This guarantees that async callbacks NEVER use stale closures.
  const lastDropTime = useRef<number>(0);
  const stateRef = useRef({ activeDeviceIP, currentPath, devices, os });

  useEffect(() => {
    stateRef.current = { activeDeviceIP, currentPath, devices, os };
  }, [activeDeviceIP, currentPath, devices, os]);

  const getBaseDirName = useCallback((path: string) => {
    if (!path) return "/";
    const normPath = path.replace(/[\\/]+/g, "/");
    if (normPath === "/" || normPath === "") return "/";
    const segments = normPath.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : "/";
  }, []);

  const getActivePort = useCallback((ip: string) => {
    const device = stateRef.current.devices.find((d) => d.ip === ip);
    return device?.port || "34931";
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error", path?: string) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type, path }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        6000,
      );
    },
    [],
  );

  // ── CORE NAVIGATION ──
  const navigateTo = useCallback(
    async (path: string, forceIP?: string) => {
      const targetIP = forceIP || stateRef.current.activeDeviceIP;
      if (!targetIP) return;
      setLoading(true);
      try {
        const port = getActivePort(targetIP);
        const result: any = await GetRemoteFiles(targetIP, port, path);
        setFiles(result.files || []);
        setCurrentPath(result.path);
        setParentPath(result.parent);
      } catch (err: any) {
        showToast("Access denied: Session may have expired", "error");
      } finally {
        setLoading(false);
      }
    },
    [getActivePort, showToast],
  );

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedDevices = localStorage.getItem("lansync_recent_devices");
    if (savedDevices) {
      try {
        setRecentDevices(JSON.parse(savedDevices));
      } catch (e) { }
    }

    Environment().then((env) => setOs(env.platform));
    GetLocalIPs().then(setLocalIPs);
    GetDeviceName().then((name) => setDeviceName(name));
    GetHomeDir().then(setHomeDir);
    GetSharedDir().then(setSharedDir);

    // Poll Network Every 3 Seconds
    const networkPoll = setInterval(() => {
      GetLocalIPs().then(setLocalIPs);
    }, 3000);

    EventsOn("transfer_progress", (progress: TransferProgress) => {
      setActiveTransfers((prev) => ({ ...prev, [progress.id]: progress }));
    });

    EventsOn("transfer_complete", (id: string) => {
      setActiveTransfers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    EventsOn("upload_start", () => setUploading(true));
    EventsOn("upload_complete", () => setUploading(false));

    EventsOn("connection_requested", (req: ConnectionRequest) => {
      setPendingRequest(req);
      sendOSNotification(
        "Connection Request",
        `${req.deviceName} wants to connect.`,
      );
    });

    EventsOn("connection_lost", (ip: string) => {
      setDevices((prev) => prev.filter((d) => d.ip !== ip));
      setActiveDeviceIP((current) => (current === ip ? null : current));
      showToast(`Device got disconnected`, "error");
    });

    // ── WAILS NATIVE OS DROP ──
    EventsOn(
      "wails:file-drop",
      async (_x: number, _y: number, paths: string[]) => {
        const {
          activeDeviceIP: targetIP,
          currentPath: path,
          os: currentOs,
        } = stateRef.current;

        if (currentOs === "windows") return;
        if (!targetIP || !paths || paths.length === 0) return;

        if (Date.now() - lastDropTime.current < 1000) return;
        lastDropTime.current = Date.now();

        setUploading(true);
        try {
          const port = getActivePort(targetIP);
          await PushToAndroid(targetIP, port, path, paths);

          navigateTo(path, targetIP);

          showToast(
            `Successfully uploaded ${paths.length} file(s)`,
            "success",
            getBaseDirName(path),
          );
        } catch (err: any) {
          showToast(
            `Native drop failed: ${err.message || String(err)}`,
            "error",
          );
        } finally {
          setUploading(false);
        }
      },
    );

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      clearInterval(networkPoll);
      EventsOff("transfer_progress");
      EventsOff("transfer_complete");
      EventsOff("upload_start");
      EventsOff("upload_complete");
      EventsOff("connection_requested");
      EventsOff("connection_lost");
      EventsOff("wails:file-drop");
    };
  }, [getActivePort, getBaseDirName, navigateTo, showToast]);

  // Handle active device switching safely
  useEffect(() => {
    if (activeDeviceIP) {
      navigateTo("/", activeDeviceIP);
    } else {
      setFiles([]);
      setCurrentPath("/");
    }
  }, [activeDeviceIP, navigateTo]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const addRecentDevice = (device: Device) => {
    setRecentDevices((prev) => {
      const filtered = prev.filter((d) => d.ip !== device.ip);
      const updated = [device, ...filtered].slice(0, 5);
      localStorage.setItem("lansync_recent_devices", JSON.stringify(updated));
      return updated;
    });
  };

  const removeRecentDevice = (ipToRemove: string) => {
    setRecentDevices((prev) => {
      const updated = prev.filter((d) => d.ip !== ipToRemove);
      localStorage.setItem("lansync_recent_devices", JSON.stringify(updated));
      return updated;
    });
  };

  const sendOSNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted")
      new Notification(title, { body });
  };

  const handleSaveSettings = async () => {
    try {
      await SaveDeviceName(deviceName);
      await SaveSharedDir(sharedDir);
      setShowSettings(false);
      showToast("Settings saved", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save settings", "error");
    }
  };

  // ── Device management ─────────────────────────────────────────────────────
  const connectToDevice = async (ipToConnect: string = newDeviceIP) => {
    if (!ipToConnect) return;
    setLoading(true);
    try {
      const device: any = await IdentifyDevice(ipToConnect);
      showToast(
        `Asking ${device.deviceName || ipToConnect} to connect...`,
        "success",
      );

      const connectedDeviceName = await RequestConnection(
        device.ip,
        device.port,
      );

      if (connectedDeviceName) {
        device.deviceName = connectedDeviceName;

        setDevices((prev) => {
          if (prev.some((d) => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
        setActiveDeviceIP(device.ip);
        setNewDeviceIP("");
        addRecentDevice(device);
        showToast(
          `Connection established with ${connectedDeviceName}!`,
          "success",
        );
      } else {
        showToast(`Connection was declined`, "error");
      }
    } catch (err: any) {
      showToast(err.message || String(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptConnection = () => {
    if (!pendingRequest) return;
    AcceptConnection(pendingRequest.ip);
    const newDevice: Device = {
      ip: pendingRequest.ip,
      port: pendingRequest.port,
      deviceName: pendingRequest.deviceName,
      os: pendingRequest.os,
      type: pendingRequest.type,
    };
    setDevices((prev) => [...prev, newDevice]);
    setActiveDeviceIP(newDevice.ip);
    addRecentDevice(newDevice);
    setPendingRequest(null);
    showToast(`Connected securely to ${newDevice.deviceName}`, "success");
  };

  const handleRejectConnection = () => {
    if (!pendingRequest) return;
    RejectConnection(pendingRequest.ip);
    setPendingRequest(null);
  };

  // ── File operations ───────────────────────────────────────────────────────
  const downloadItem = async (file: FileInfo) => {
    const targetIP = stateRef.current.activeDeviceIP;
    if (!targetIP) return;
    try {
      const port = getActivePort(targetIP);
      let savedPath = file.isDir
        ? await DownloadFolder(targetIP, port, file.path)
        : await DownloadFile(targetIP, port, file.path);

      if (savedPath) {
        showToast(
          `Successfully downloaded: ${file.name}`,
          "success",
          savedPath,
        );
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes("cancelled")) {
        showToast("Download was cancelled", "error");
      } else {
        showToast(`Download failed: ${msg}`, "error");
      }
    }
  };

  const handleUploadFiles = async () => {
    const targetIP = stateRef.current.activeDeviceIP;
    const path = stateRef.current.currentPath;
    if (!targetIP) return;
    try {
      const selectedFiles = await SelectFiles();
      if (!selectedFiles || selectedFiles.length === 0) return;

      await PushToAndroid(
        targetIP,
        getActivePort(targetIP),
        path,
        selectedFiles,
      );
      navigateTo(path, targetIP);
      showToast(
        `${selectedFiles.length} file(s) successfully uploaded`,
        "success",
        getBaseDirName(path),
      );
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes("cancelled")) {
        showToast("Upload was cancelled", "error");
      } else {
        showToast(`Upload failed: ${msg}`, "error");
      }
    }
  };

  const handleUploadFolder = async () => {
    const targetIP = stateRef.current.activeDeviceIP;
    const path = stateRef.current.currentPath;
    if (!targetIP) return;
    try {
      const selectedFolder = await SelectDirectory();
      if (!selectedFolder) return;

      await PushFolderToAndroid(
        targetIP,
        getActivePort(targetIP),
        path,
        selectedFolder,
      );
      navigateTo(path, targetIP);
      showToast(
        `Folder successfully uploaded`,
        "success",
        getBaseDirName(path),
      );
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes("cancelled")) {
        showToast("Folder upload was cancelled", "error");
      } else {
        showToast(`Folder upload failed: ${msg}`, "error");
      }
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    const targetIP = stateRef.current.activeDeviceIP;
    const path = stateRef.current.currentPath;
    if (!targetIP || !folderName.trim()) return;

    setLoading(true);
    try {
      await MakeDirectory(
        targetIP,
        getActivePort(targetIP),
        path,
        folderName.trim(),
      );
      navigateTo(path, targetIP);
      showToast(
        `Folder "${folderName}" created`,
        "success",
        getBaseDirName(path),
      );
    } catch (err: any) {
      showToast(
        `Failed to create folder: ${err.message || String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleHtmlDropUpload = async (droppedFiles: File[]) => {
    const targetIP = stateRef.current.activeDeviceIP;
    const path = stateRef.current.currentPath;
    const currentOs = stateRef.current.os;

    if (!targetIP) return;
    if (currentOs !== "windows") return;

    lastDropTime.current = Date.now();
    setUploading(true);
    let successCount = 0;

    try {
      const token = await GetSessionToken(targetIP);
      if (!token) throw new Error("Session expired. Please reconnect.");

      const port = getActivePort(targetIP);

      for (const file of droppedFiles) {
        const formData = new FormData();
        formData.append("files", file);

        const res = await fetch(
          `http://${targetIP}:${port}/api/files/upload?dir=${encodeURIComponent(path)}&name=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        if (res.ok) successCount++;
        else throw new Error("Server rejected the file.");
      }

      navigateTo(path, targetIP);
      showToast(
        `Successfully uploaded ${successCount} file(s)`,
        "success",
        getBaseDirName(path),
      );
    } catch (err: any) {
      showToast(`Drop upload failed: ${err.message || String(err)}`, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleShareClipboard = async () => {
    const targetIP = stateRef.current.activeDeviceIP;
    if (!targetIP) return;
    setLoading(true);
    try {
      await ShareClipboardText(targetIP, getActivePort(targetIP));
      showToast(`Desktop clipboard sent to device`, "success");
    } catch (err: any) {
      showToast(
        `Clipboard share failed: ${err.message || String(err)}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-bg-base text-text select-none overflow-hidden">
      <ToastContainer toasts={toasts} />
      <TitleBar />

      <ConnectionRequestModal
        request={pendingRequest}
        onAccept={handleAcceptConnection}
        onReject={handleRejectConnection}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar
          localDeviceName={deviceName}
          localIPs={localIPs}
          devices={devices}
          activeDeviceIP={activeDeviceIP}
          recentDevices={recentDevices}
          newDeviceIP={newDeviceIP}
          loading={loading}
          onSetActiveDevice={setActiveDeviceIP}
          onDisconnect={(ip) => Disconnect(ip)}
          onNewDeviceIPChange={setNewDeviceIP}
          onConnect={connectToDevice}
          onRemoveRecent={removeRecentDevice}
          setShowSettings={setShowSettings}
          onRefresh={() => GetLocalIPs().then(setLocalIPs)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden m-2 mt-0 rounded-xl">
          <FileBrowser
            os={os}
            activeDeviceIP={activeDeviceIP}
            files={files}
            currentPath={currentPath}
            parentPath={parentPath}
            deviceRootPath={""}
            loading={loading}
            uploading={uploading}
            onNavigate={(path) => navigateTo(path)}
            onDownload={downloadItem}
            onUploadFiles={handleUploadFiles}
            onUploadFolder={handleUploadFolder}
            onHtmlDropUpload={handleHtmlDropUpload}
            onCreateFolder={handleCreateFolder}
            onShareClipboard={handleShareClipboard}
            onError={(msg) => showToast(msg, "error")}
          />
          <TransferDrawer
            transfers={activeTransfers}
            onCancelAll={() => {
              if (activeDeviceIP) {
                CancelTransfers(activeDeviceIP);
              }
            }}
          />
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        deviceName={deviceName}
        sharedDir={sharedDir}
        homeDir={homeDir}
        setDeviceName={setDeviceName}
        setSharedDir={setSharedDir}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
