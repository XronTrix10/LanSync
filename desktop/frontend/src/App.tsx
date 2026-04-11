import { useEffect, useRef, useState } from "react";
import {
  CancelTransfers,
  Disconnect,
  GetDeviceName,
  GetHomeDir,
  GetLocalIPs,
  GetSharedDir,
  SaveDeviceName,
  SaveSharedDir,
} from "../wailsjs/go/main/App";
import { EventsOff, EventsOn, Environment } from "../wailsjs/runtime/runtime";

import { ConnectionRequestModal } from "./components/ConnectionRequestModal";
import { FileBrowser } from "./components/FileBrowser";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { ToastContainer } from "./components/ToastContainer";
import { TransferDrawer } from "./components/TransferDrawer";
import { useDeviceConnection } from "./hooks/useDeviceConnection";
import { useFileTransfer } from "./hooks/useFileTransfer";
import { useToasts } from "./hooks/useToasts";
import type { DiscoveredDevice, TransferProgress } from "./types";
import { loadRecentDevices } from "./utils/deviceUtils";

export default function App() {
  const [os, setOs] = useState("");
  const [localIPs, setLocalIPs] = useState<string[]>(["Loading..."]);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<Record<string, TransferProgress>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [sharedDir, setSharedDir] = useState("");
  const [homeDir, setHomeDir] = useState("");
  const [uploading, setUploading] = useState(false);

  // ── Stable refs for use inside async callbacks / hooks ──────────────────
  const activeDeviceIPRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>("/");
  const osRef = useRef<string>("");

  // ── Hooks ────────────────────────────────────────────────────────────────
  const { toasts, showToast } = useToasts();

  const {
    devices,
    activeDeviceIP,
    setActiveDeviceIP,
    newDeviceIP,
    setNewDeviceIP,
    pendingRequest,
    recentDevices,
    setRecentDevices,
    loading: connectionLoading,
    connectToDevice,
    removeRecentDevice,
    handleAcceptConnection,
    handleRejectConnection,
    onConnectionRequested,
    onConnectionLost,
  } = useDeviceConnection(showToast);

  const {
    currentPath,
    setCurrentPath,
    parentPath,
    files,
    setFiles,
    loading: fileLoading,
    navigateTo,
    downloadItem,
    handleUploadFiles,
    handleUploadFolder,
    handleCreateFolder,
    handleHtmlDropUpload,
    handleShareClipboard,
    handleNativeFileDrop,
  } = useFileTransfer(devices, activeDeviceIPRef, currentPathRef, osRef, showToast);

  const loading = connectionLoading || fileLoading;

  // Keep refs in sync with state
  useEffect(() => {
    activeDeviceIPRef.current = activeDeviceIP;
  }, [activeDeviceIP]);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    osRef.current = os;
  }, [os]);

  // Navigate when active device changes
  useEffect(() => {
    if (activeDeviceIP) {
      navigateTo("/", activeDeviceIP);
    } else {
      setFiles([]);
      setCurrentPath("/");
    }
  }, [activeDeviceIP, navigateTo, setFiles, setCurrentPath]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setRecentDevices(loadRecentDevices());

    Environment().then((env) => setOs(env.platform));
    GetLocalIPs().then(setLocalIPs);
    GetDeviceName().then(setDeviceName);
    GetHomeDir().then(setHomeDir);
    GetSharedDir().then(setSharedDir);

    const networkPoll = setInterval(() => GetLocalIPs().then(setLocalIPs), 3000);

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
    EventsOn("devices_discovered", (devs: DiscoveredDevice[]) => {
      setDiscoveredDevices(devs || []);
    });
    EventsOn("connection_requested", onConnectionRequested);
    EventsOn("connection_lost", onConnectionLost);
    EventsOn("wails:file-drop", async (_x: number, _y: number, paths: string[]) => {
      handleNativeFileDrop(paths);
    });

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      clearInterval(networkPoll);
      EventsOff("transfer_progress");
      EventsOff("transfer_complete");
      EventsOff("upload_start");
      EventsOff("upload_complete");
      EventsOff("devices_discovered");
      EventsOff("connection_requested");
      EventsOff("connection_lost");
      EventsOff("wails:file-drop");
    };
  }, [onConnectionRequested, onConnectionLost, handleNativeFileDrop, setRecentDevices]);

  const handleSaveSettings = async () => {
    try {
      await SaveDeviceName(deviceName);
      await SaveSharedDir(sharedDir);
      setShowSettings(false);
      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save settings", "error");
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
          discoveredDevices={discoveredDevices}
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
              if (activeDeviceIP) CancelTransfers(activeDeviceIP);
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
