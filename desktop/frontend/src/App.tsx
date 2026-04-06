import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AcceptConnection,
  Disconnect,
  DownloadFile,
  DownloadFolder,
  GetDeviceName,
  GetLocalIPs,
  GetRemoteFiles,
  GetSessionToken,
  IdentifyDevice,
  MakeDirectory,
  PushFolderToAndroid,
  PushToAndroid,
  RejectConnection,
  RequestConnection,
  SaveDeviceName,
  SelectDirectory,
  SelectFiles,
  ShareClipboardText,
} from "../wailsjs/go/main/App";
import { EventsOff, EventsOn } from "../wailsjs/runtime/runtime";

import { FileBrowser } from "./components/FileBrowser";
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
  const [localIPs, setLocalIPs] = useState<string[]>(["Loading..."]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceIP, setActiveDeviceIP] = useState<string | null>(null);
  const [newDeviceIP, setNewDeviceIP] = useState<string>("");
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

  const handleSaveSettings = async () => {
    try {
      await SaveDeviceName(deviceName);
      setShowSettings(false);
      showToast("Settings saved", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save settings", "error");
    }
  };

  // ── HYBRID DROP STATE (Cross-Platform Savior) ──
  const lastDropTime = useRef<number>(0);
  const dropStateRef = useRef({ activeDeviceIP, currentPath, devices });

  useEffect(() => {
    dropStateRef.current = { activeDeviceIP, currentPath, devices };
  }, [activeDeviceIP, currentPath, devices]);

  // FIX: Moved getBaseDirName above useEffect and 
  // upgraded the regex to aggressively squash ALL backslashes.
  const getBaseDirName = (path: string) => {
    if (!path) return "/";
    const normPath = path.replace(/[\\/]+/g, "/");
    if (normPath === "/" || normPath === "") return "/";
    const segments = normPath.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : "/";
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedDevices = localStorage.getItem("lansync_recent_devices");
    if (savedDevices) {
      try {
        setRecentDevices(JSON.parse(savedDevices));
      } catch (e) { }
    }

    GetLocalIPs().then(setLocalIPs);
    GetDeviceName().then((name) => setDeviceName(name));

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
      showToast(`Connection lost or closed`, "error");
    });

    // ── WAILS NATIVE OS DROP (Linux Fallback) ──
    EventsOn(
      "wails:file-drop",
      async (_x: number, _y: number, paths: string[]) => {
        const { activeDeviceIP, currentPath, devices } = dropStateRef.current;
        if (!activeDeviceIP || !paths || paths.length === 0) return;

        // Debounce: If HTML5 handled this < 1 second ago (Windows), ignore this native OS event!
        if (Date.now() - lastDropTime.current < 1000) return;
        lastDropTime.current = Date.now();

        setUploading(true);
        try {
          const port =
            devices.find((d) => d.ip === activeDeviceIP)?.port || "34931";

          // Use backend binding to push absolute paths natively
          await PushToAndroid(activeDeviceIP, port, currentPath, paths);

          // Fetch new files to update UI
          const result: any = await GetRemoteFiles(
            activeDeviceIP,
            port,
            currentPath,
          );
          setFiles(result.files || []);
          setCurrentPath(result.path);
          setParentPath(result.parent);

          // FIX: Uses the bulletproof getBaseDirName logic
          showToast(
            `Successfully uploaded ${paths.length} file(s)`,
            "success",
            getBaseDirName(currentPath),
          );
        } catch (err: any) {
          showToast(
            `Drop upload failed: ${err.message || String(err)}`,
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
      EventsOff("transfer_progress");
      EventsOff("transfer_complete");
      EventsOff("upload_start");
      EventsOff("upload_complete");
      EventsOff("connection_requested");
      EventsOff("connection_lost");
      EventsOff("wails:file-drop");
    };
  }, []);

  useEffect(() => {
    if (activeDeviceIP) navigateTo("/");
    else {
      setFiles([]);
      setCurrentPath("/");
    }
  }, [activeDeviceIP]);

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

  const showToast = (
    message: string,
    type: "success" | "error",
    path?: string,
  ) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, path }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      6000,
    );
  };

  const getActivePort = () => {
    const device = devices.find((d) => d.ip === activeDeviceIP);
    return device?.port || "34931";
  };

  // ── Device management ─────────────────────────────────────────────────────
  const connectToDevice = async (ipToConnect: string = newDeviceIP) => {
    if (!ipToConnect) return;
    setLoading(true);
    try {
      const device: any = await IdentifyDevice(ipToConnect);
      showToast(`Asking ${device.deviceName || ipToConnect} to connect...`, "success");

      const connectedDeviceName = await RequestConnection(device.ip, device.port);

      if (connectedDeviceName) {
        // Overwrite the generic discovery name with the real, custom name from the handshake!
        device.deviceName = connectedDeviceName;

        setDevices((prev) => {
          if (prev.some((d) => d.ip === device.ip)) return prev;
          return [...prev, device];
        });
        setActiveDeviceIP(device.ip);
        setNewDeviceIP("");
        addRecentDevice(device);
        showToast(`Connection established with ${connectedDeviceName}!`, "success");
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
  const navigateTo = async (path: string) => {
    if (!activeDeviceIP) return;
    setLoading(true);
    try {
      const result: any = await GetRemoteFiles(
        activeDeviceIP,
        getActivePort(),
        path,
      );
      setFiles(result.files || []);
      setCurrentPath(result.path);
      setParentPath(result.parent);
    } catch (err: any) {
      showToast("Access denied. Session may have expired.", "error");
    } finally {
      setLoading(false);
    }
  };

  const downloadItem = async (file: FileInfo) => {
    if (!activeDeviceIP) return;
    try {
      let savedPath = file.isDir
        ? await DownloadFolder(activeDeviceIP, getActivePort(), file.path)
        : await DownloadFile(activeDeviceIP, getActivePort(), file.path);

      if (savedPath) {
        showToast(
          `Successfully downloaded: ${file.name}`,
          "success",
          savedPath,
        );
      }
    } catch (err: any) {
      showToast(`Download failed: ${err.message || String(err)}`, "error");
    }
  };

  const handleUploadFiles = async () => {
    if (!activeDeviceIP) return;
    try {
      const selectedFiles = await SelectFiles();
      if (!selectedFiles || selectedFiles.length === 0) return;
      await PushToAndroid(
        activeDeviceIP,
        getActivePort(),
        currentPath,
        selectedFiles,
      );
      navigateTo(currentPath);
      showToast(
        `${selectedFiles.length} file(s) successfully uploaded`,
        "success",
        getBaseDirName(currentPath),
      );
    } catch (err: any) {
      showToast(`Upload failed: ${err.message || String(err)}`, "error");
    }
  };

  const handleUploadFolder = async () => {
    if (!activeDeviceIP) return;
    try {
      const selectedFolder = await SelectDirectory();
      if (!selectedFolder) return;
      await PushFolderToAndroid(
        activeDeviceIP,
        getActivePort(),
        currentPath,
        selectedFolder,
      );
      navigateTo(currentPath);
      showToast(
        `Folder successfully uploaded`,
        "success",
        getBaseDirName(currentPath),
      );
    } catch (err: any) {
      showToast(`Folder upload failed: ${err.message || String(err)}`, "error");
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    if (!activeDeviceIP || !folderName.trim()) return;
    setLoading(true);
    try {
      await MakeDirectory(
        activeDeviceIP,
        getActivePort(),
        currentPath,
        folderName.trim(),
      );
      navigateTo(currentPath);
      showToast(
        `Folder "${folderName}" created`,
        "success",
        getBaseDirName(currentPath),
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

  // ── HTML5 DROP (Windows / Mac) ──
  const handleDropUpload = async (droppedFiles: File[]) => {
    if (!activeDeviceIP) return;

    // Stamp the drop to prevent wails:file-drop from duplicate firing
    lastDropTime.current = Date.now();

    setUploading(true);
    let successCount = 0;

    try {
      if (typeof GetSessionToken !== "function") {
        throw new Error(
          "Wails bindings out of date. Please run 'wails generate module'.",
        );
      }

      const token = await GetSessionToken(activeDeviceIP);
      if (!token) throw new Error("Session expired. Please reconnect.");

      for (const file of droppedFiles) {
        const formData = new FormData();
        formData.append("files", file);

        const res = await fetch(
          `http://${activeDeviceIP}:${getActivePort()}/api/files/upload?dir=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        if (res.ok) successCount++;
        else throw new Error("Server rejected the file.");
      }

      navigateTo(currentPath);
      showToast(
        `Successfully uploaded ${successCount} file(s)`,
        "success",
        getBaseDirName(currentPath),
      );
    } catch (err: any) {
      showToast(`Drop upload failed: ${err.message || String(err)}`, "error");
    } finally {
      setUploading(false);
    }
  };

  // ── CLIPBOARD FEATURE ──
  const handleShareClipboard = async () => {
    if (!activeDeviceIP) return;
    setLoading(true);
    try {
      await ShareClipboardText(activeDeviceIP, getActivePort());
      showToast(`Desktop clipboard sent to device`, "success");
    } catch (err: any) {
      showToast(`Clipboard share failed: ${err.message || String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-bg-base text-[#dde4f0] select-none overflow-hidden">
      <ToastContainer toasts={toasts} />
      <TitleBar />

      {pendingRequest && (
        <div className="absolute inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-accent/30 rounded-2xl w-full max-w-sm shadow-[0_0_40px_rgba(61,158,255,0.1)] p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 border border-accent/20">
              <ShieldAlert size={28} className="text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-[#dde4f0] mb-1">
              Connection Request
            </h3>
            <p className="text-sm text-[#8090a8] mb-6">
              <strong className="text-[#dde4f0]">
                {pendingRequest.deviceName}
              </strong>{" "}
              ({pendingRequest.ip}) wants to connect.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={handleRejectConnection}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#f04a6a] bg-[#f04a6a]/10 hover:bg-[#f04a6a]/20 transition-all"
              >
                Reject
              </button>
              <button
                onClick={handleAcceptConnection}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#00c9a7] bg-[#00c9a7]/10 hover:bg-[#00c9a7]/20 transition-all"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

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
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <FileBrowser
            activeDeviceIP={activeDeviceIP}
            files={files}
            currentPath={currentPath}
            parentPath={parentPath}
            deviceRootPath={""}
            loading={loading}
            uploading={uploading}
            onNavigate={navigateTo}
            onDownload={downloadItem}
            onUploadFiles={handleUploadFiles}
            onUploadFolder={handleUploadFolder}
            onDropUpload={handleDropUpload}
            onCreateFolder={handleCreateFolder}
            onShareClipboard={handleShareClipboard}
            onError={(msg) => showToast(msg, "error")}
          />
          <TransferDrawer transfers={activeTransfers} />
        </div>
      </div>

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-panel border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Settings</h2>
            <p className="text-sm text-gray-400 mb-6">Customize how this PC appears on your network.</p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 tracking-wider mb-2">
                DISPLAY NAME
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full bg-[#0a0c10] border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. Sreejan's MacBook"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={!deviceName.trim()}
                className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
