import { useEffect, useState } from "react";
import {
  DownloadFile,
  DownloadFolder,
  GetLocalIP,
  GetRemoteFiles,
  IdentifyDevice,
  PushFolderToAndroid,
  PushToAndroid,
  SelectDirectory,
  SelectFiles,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

import type { FileInfo, TransferProgress, Toast, Device } from "./types";
import { Sidebar } from "./components/Sidebar";
import { FileBrowser } from "./components/FileBrowser";
import { TransferDrawer } from "./components/TransferDrawer";
import { ToastContainer } from "./components/ToastContainer";
import { TitleBar } from "./components/TitleBar";

export default function App() {
  const [localIP, setLocalIP] = useState<string>("Loading...");
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);

  // Multi-Device State
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDeviceIP, setActiveDeviceIP] = useState<string | null>(null);
  const [newDeviceIP, setNewDeviceIP] = useState<string>("");

  // Persistence State
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);

  // File Browser State
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [parentPath, setParentPath] = useState<string>("");
  const [deviceRootPath, setDeviceRootPath] = useState<string>(""); // NEW: Stores the absolute root sandbox
  const [files, setFiles] = useState<FileInfo[]>([]);

  const [activeTransfers, setActiveTransfers] = useState<
    Record<string, TransferProgress>
  >({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedDevices = localStorage.getItem("lansync_recent_devices");
    if (savedDevices) {
      try {
        setRecentDevices(JSON.parse(savedDevices));
      } catch (e) {
        console.error("Failed to parse recent devices");
      }
    }

    GetLocalIP().then(setLocalIP);

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

    if (
      "Notification" in window &&
      Notification.permission !== "denied" &&
      Notification.permission !== "granted"
    ) {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (activeDeviceIP) {
      setDeviceRootPath(""); // Reset root context for new device
      navigateTo("/");
    } else {
      setFiles([]);
      setCurrentPath("/");
      setDeviceRootPath("");
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
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  const showToast = (message: string, type: "success" | "error", path?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, path }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  // Convert absolute paths to clean relative paths for Notifications/Toasts
  const getDisplayPath = (absolutePath: string) => {
    if (!absolutePath || !deviceRootPath) return absolutePath;
    const normPath = absolutePath.replace(/\\/g, "/");
    const normRoot = deviceRootPath.replace(/\\/g, "/");
    
    if (normPath.startsWith(normRoot)) {
      let rel = normPath.substring(normRoot.length);
      if (!rel.startsWith("/")) rel = "/" + rel;
      return rel === "/" ? "/" : rel;
    }
    return normPath;
  };

  // ── Device management ─────────────────────────────────────────────────────
  const connectToDevice = async (ipToConnect: string = newDeviceIP) => {
    if (!ipToConnect) return;
    setLoading(true);
    try {
      const device: any = await IdentifyDevice(ipToConnect);
      setDevices((prev) => {
        if (prev.some((d) => d.ip === device.ip)) return prev;
        return [...prev, device];
      });
      setActiveDeviceIP(device.ip);
      setNewDeviceIP("");
      addRecentDevice(device);
      showToast(`Connected to ${device.deviceName}`, "success");
    } catch (err: any) {
      showToast(err.message || "Could not connect device", "error");
    } finally {
      setLoading(false);
    }
  };

  const disconnectDevice = (ipToDisconnect: string) => {
    setDevices((prev) => prev.filter((d) => d.ip !== ipToDisconnect));
    if (activeDeviceIP === ipToDisconnect) {
      setActiveDeviceIP(null);
    }
  };

  // ── File operations ───────────────────────────────────────────────────────
  const navigateTo = async (path: string) => {
    if (!activeDeviceIP) return;
    setLoading(true);
    try {
      const result: any = await GetRemoteFiles(activeDeviceIP, path);
      
      const normPath = result.path ? result.path.replace(/\\/g, "/") : "";
      const normParent = result.parent ? result.parent.replace(/\\/g, "/") : "";

      // If we requested "/", the result IS the absolute root of the device shared folder
      const isRootNav = path === "/";
      if (isRootNav) {
        setDeviceRootPath(normPath);
      }
      
      const activeRoot = isRootNav ? normPath : deviceRootPath;

      setFiles(result.files || []);
      setCurrentPath(normPath);
      
      // Stop the user from going "UP" beyond the root boundary
      if (normPath === activeRoot) {
        setParentPath(""); 
      } else {
        setParentPath(normParent);
      }
    } catch (err: any) {
      showToast("Failed to load directory", "error");
    } finally {
      setLoading(false);
    }
  };

  const downloadItem = async (file: FileInfo) => {
    if (!activeDeviceIP) return;
    try {
      let savedPath = "";
      if (file.isDir) {
        savedPath = await DownloadFolder(activeDeviceIP, file.path);
      } else {
        savedPath = await DownloadFile(activeDeviceIP, file.path);
      }
      if (savedPath) {
        showToast(`Successfully downloaded: ${file.name}`, "success", savedPath);
        sendOSNotification("Download Complete", `${file.name} saved to computer.`);
      }
    } catch (err: any) {
      showToast(`Download failed: ${err.message}`, "error");
    }
  };

  const handleUploadFiles = async () => {
    if (!activeDeviceIP) return;
    try {
      const selectedFiles = await SelectFiles();
      if (!selectedFiles || selectedFiles.length === 0) return;

      await PushToAndroid(activeDeviceIP, currentPath, selectedFiles);
      navigateTo(currentPath);
      showToast(
        `${selectedFiles.length} file(s) successfully uploaded`,
        "success",
        getDisplayPath(currentPath), // Clean path
      );
    } catch (err: any) {
      showToast(`Upload failed: ${err.message}`, "error");
    }
  };

  const handleUploadFolder = async () => {
    if (!activeDeviceIP) return;
    try {
      const selectedFolder = await SelectDirectory();
      if (!selectedFolder) return;

      await PushFolderToAndroid(activeDeviceIP, currentPath, selectedFolder);
      navigateTo(currentPath);
      showToast(`Folder successfully uploaded`, "success", getDisplayPath(currentPath)); // Clean path
    } catch (err: any) {
      showToast(`Folder upload failed: ${err.message}`, "error");
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    if (!activeDeviceIP || !folderName.trim()) return;

    setLoading(true);
    try {
      // Direct HTTP Post safely encodes spaces and special characters
      const response = await fetch(
        `http://${activeDeviceIP}/api/files/mkdir?dir=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(folderName.trim())}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Server rejected request`);
      }

      navigateTo(currentPath); // Refresh the UI to show the new folder
      showToast(`Folder "${folderName}" created`, "success", getDisplayPath(currentPath));
    } catch (err: any) {
      showToast(`Failed to create folder: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDropUpload = async (droppedFiles: File[]) => {
    if (!activeDeviceIP || droppedFiles.length === 0) return;
    
    setUploading(true);
    let successCount = 0;

    try {
      for (const file of droppedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `http://${activeDeviceIP}/api/files/upload?dir=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(file.name)}`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        successCount++;
      }
      
      navigateTo(currentPath);
      showToast(`${successCount} file(s) successfully dropped & uploaded`, "success", getDisplayPath(currentPath)); // Clean path
      sendOSNotification("Upload Complete", `${successCount} file(s) uploaded.`);
      
    } catch (err: any) {
      showToast(`Upload failed: ${err.message}`, "error");
    } finally {
      setUploading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-bg-base text-[#dde4f0] select-none overflow-hidden">
      <ToastContainer toasts={toasts} />
      <TitleBar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar
          localIP={localIP}
          devices={devices}
          activeDeviceIP={activeDeviceIP}
          recentDevices={recentDevices}
          newDeviceIP={newDeviceIP}
          loading={loading}
          onSetActiveDevice={setActiveDeviceIP}
          onDisconnect={disconnectDevice}
          onNewDeviceIPChange={setNewDeviceIP}
          onConnect={connectToDevice}
          onRemoveRecent={removeRecentDevice}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <FileBrowser
            activeDeviceIP={activeDeviceIP}
            files={files}
            currentPath={currentPath}
            parentPath={parentPath}
            deviceRootPath={deviceRootPath} // <-- PASSING THE ROOT HERE
            loading={loading}
            uploading={uploading}
            onNavigate={navigateTo}
            onDownload={downloadItem}
            onUploadFiles={handleUploadFiles}
            onUploadFolder={handleUploadFolder}
            onDropUpload={handleDropUpload}
            onCreateFolder={handleCreateFolder}
            onError={(msg) => showToast(msg, "error")}
          />
          <TransferDrawer transfers={activeTransfers} />
        </div>
      </div>
    </div>
  );
}