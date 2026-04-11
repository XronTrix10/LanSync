import { useCallback, useRef, useState } from "react";
import {
  DownloadFile,
  DownloadFolder,
  GetRemoteFiles,
  GetSessionToken,
  MakeDirectory,
  PushFolderToAndroid,
  PushToAndroid,
  SelectDirectory,
  SelectFiles,
  ShareClipboardText,
} from "../../wailsjs/go/main/App";
import type { Device, FileInfo } from "../types";
import { getBaseDirName } from "../utils/pathUtils";

type ShowToast = (
  message: string,
  type: "success" | "error",
  path?: string,
) => void;

export function useFileTransfer(
  devices: Device[],
  activeDeviceIPRef: React.MutableRefObject<string | null>,
  currentPathRef: React.MutableRefObject<string>,
  osRef: React.MutableRefObject<string>,
  showToast: ShowToast,
) {
  const [currentPath, setCurrentPath] = useState("/");
  const [parentPath, setParentPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const lastDropTime = useRef<number>(0);

  const getActivePort = useCallback(
    (ip: string) => {
      const device = devices.find((d) => d.ip === ip);
      return device?.port || "34931";
    },
    [devices],
  );

  const navigateTo = useCallback(
    async (path: string, forceIP?: string) => {
      const targetIP = forceIP || activeDeviceIPRef.current;
      if (!targetIP) return;
      setLoading(true);
      try {
        const port = devices.find((d) => d.ip === targetIP)?.port || "34931";
        const result: any = await GetRemoteFiles(targetIP, port, path);
        setFiles(result.files || []);
        setCurrentPath(result.path);
        setParentPath(result.parent);
        currentPathRef.current = result.path;
      } catch {
        showToast("Access denied: Session may have expired", "error");
      } finally {
        setLoading(false);
      }
    },
    [devices, activeDeviceIPRef, currentPathRef, showToast],
  );

  const downloadItem = useCallback(
    async (file: FileInfo) => {
      const targetIP = activeDeviceIPRef.current;
      if (!targetIP) return;
      try {
        const port = getActivePort(targetIP);
        const savedPath = file.isDir
          ? await DownloadFolder(targetIP, port, file.path)
          : await DownloadFile(targetIP, port, file.path);
        if (savedPath) {
          showToast(`Successfully downloaded: ${file.name}`, "success", savedPath);
        }
      } catch (err: any) {
        const msg = err.message || String(err);
        if (msg.toLowerCase().includes("cancelled")) {
          showToast("Download was cancelled", "error");
        } else {
          showToast(`Download failed: ${msg}`, "error");
        }
      }
    },
    [activeDeviceIPRef, getActivePort, showToast],
  );

  const handleUploadFiles = useCallback(async () => {
    const targetIP = activeDeviceIPRef.current;
    const path = currentPathRef.current;
    if (!targetIP) return;
    try {
      const selectedFiles = await SelectFiles();
      if (!selectedFiles || selectedFiles.length === 0) return;
      await PushToAndroid(targetIP, getActivePort(targetIP), path, selectedFiles);
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
  }, [activeDeviceIPRef, currentPathRef, getActivePort, navigateTo, showToast]);

  const handleUploadFolder = useCallback(async () => {
    const targetIP = activeDeviceIPRef.current;
    const path = currentPathRef.current;
    if (!targetIP) return;
    try {
      const selectedFolder = await SelectDirectory();
      if (!selectedFolder) return;
      await PushFolderToAndroid(targetIP, getActivePort(targetIP), path, selectedFolder);
      navigateTo(path, targetIP);
      showToast("Folder successfully uploaded", "success", getBaseDirName(path));
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes("cancelled")) {
        showToast("Folder upload was cancelled", "error");
      } else {
        showToast(`Folder upload failed: ${msg}`, "error");
      }
    }
  }, [activeDeviceIPRef, currentPathRef, getActivePort, navigateTo, showToast]);

  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      const targetIP = activeDeviceIPRef.current;
      const path = currentPathRef.current;
      if (!targetIP || !folderName.trim()) return;
      setLoading(true);
      try {
        await MakeDirectory(targetIP, getActivePort(targetIP), path, folderName.trim());
        navigateTo(path, targetIP);
        showToast(`Folder "${folderName}" created`, "success", getBaseDirName(path));
      } catch (err: any) {
        showToast(`Failed to create folder: ${err.message || String(err)}`, "error");
      } finally {
        setLoading(false);
      }
    },
    [activeDeviceIPRef, currentPathRef, getActivePort, navigateTo, showToast],
  );

  const handleHtmlDropUpload = useCallback(
    async (droppedFiles: File[]) => {
      const targetIP = activeDeviceIPRef.current;
      const path = currentPathRef.current;
      const currentOs = osRef.current;
      if (!targetIP || currentOs !== "windows") return;

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
    },
    [activeDeviceIPRef, currentPathRef, osRef, getActivePort, navigateTo, showToast],
  );

  const handleShareClipboard = useCallback(async () => {
    const targetIP = activeDeviceIPRef.current;
    if (!targetIP) return;
    setLoading(true);
    try {
      await ShareClipboardText(targetIP, getActivePort(targetIP));
      showToast("Desktop clipboard sent to device", "success");
    } catch (err: any) {
      showToast(`Clipboard share failed: ${err.message || String(err)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [activeDeviceIPRef, getActivePort, showToast]);

  // Native OS file-drop handler (non-Windows, uses Wails event)
  const handleNativeFileDrop = useCallback(
    async (paths: string[]) => {
      const targetIP = activeDeviceIPRef.current;
      const path = currentPathRef.current;
      const currentOs = osRef.current;
      if (currentOs === "windows" || !targetIP || !paths?.length) return;
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
        showToast(`Native drop failed: ${err.message || String(err)}`, "error");
      } finally {
        setUploading(false);
      }
    },
    [activeDeviceIPRef, currentPathRef, osRef, getActivePort, navigateTo, showToast],
  );

  return {
    currentPath,
    setCurrentPath,
    parentPath,
    files,
    setFiles,
    loading,
    uploading,
    navigateTo,
    downloadItem,
    handleUploadFiles,
    handleUploadFolder,
    handleCreateFolder,
    handleHtmlDropUpload,
    handleShareClipboard,
    handleNativeFileDrop,
  };
}
