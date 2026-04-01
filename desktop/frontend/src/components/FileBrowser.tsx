import {
  ChevronUp,
  CloudUpload,
  Download,
  FolderPlus,
  FolderUp,
  Layers,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileInfo } from "../types";
import { formatSize } from "../types";
import { FileIcon, fileIconColor } from "./FileIcon";

interface Props {
  activeDeviceIP: string | null;
  files: FileInfo[];
  currentPath: string;
  parentPath: string;
  deviceRootPath: string;
  loading: boolean;
  uploading: boolean;
  onNavigate: (path: string) => void;
  onDownload: (file: FileInfo) => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onDropUpload: (files: File[]) => void;
  onCreateFolder: (folderName: string) => void;
  onError: (msg: string) => void;
}

export function FileBrowser({
  activeDeviceIP,
  files,
  currentPath,
  parentPath,
  deviceRootPath,
  loading,
  uploading,
  onNavigate,
  onDownload,
  onUploadFiles,
  onUploadFolder,
  onDropUpload,
  onCreateFolder,
  onError,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const dragCounter = useRef(0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowFolderMenu(false);
    if (showFolderMenu) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showFolderMenu]);

  // ── Drag and drop handlers ──────────────────────────────────────────────────
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeDeviceIP) return;
      dragCounter.current++;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    },
    [activeDeviceIP],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(false);
      dragCounter.current = 0;

      if (!e.dataTransfer || !e.dataTransfer.items) return;

      const validFiles: File[] = [];
      let hasFolder = false;
      let hasLargeFile = false;

      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry?.isDirectory) {
            hasFolder = true;
          } else {
            const file = item.getAsFile();
            if (file) {
              if (file.size >= 4294967296) {
                hasLargeFile = true;
              } else {
                validFiles.push(file);
              }
            }
          }
        }
      }

      if (hasFolder) {
        onError("Please use the 'Folder' button to upload folders");
      }
      if (hasLargeFile) {
        onError("Please use the 'Files' button to upload large files");
      }
      if (validFiles.length > 0) {
        onDropUpload(validFiles);
      }
    },
    [onDropUpload, onError],
  );

  const handleCreateFolderSubmit = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    // 1. Validate alphanumeric and spaces
    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
      setFolderError("Provide valid folder name");
      return;
    }

    // 2. Validate if folder already exists (case-insensitive check)
    const folderExists = files.some(
      (file) => file.isDir && file.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (folderExists) {
      setFolderError("Folder with this name already exists");
      return;
    }

    // 3. If valid, proceed and close
    onCreateFolder(trimmed);
    setShowCreateModal(false);
    setNewFolderName("");
    setFolderError(""); // Clear any lingering errors
  };

  // ── Path display calculations ──────────────────────────────────────────────
  const normPath = currentPath ? currentPath.replace(/\\/g, "/") : "";
  const normRoot = deviceRootPath ? deviceRootPath.replace(/\\/g, "/") : "";

  let displayPath = normPath;
  if (normRoot && normPath.startsWith(normRoot)) {
    displayPath = normPath.substring(normRoot.length);
  }
  if (!displayPath.startsWith("/")) displayPath = "/" + displayPath;

  const pathSegments = displayPath.split("/").filter(Boolean);

  const isRoot = normPath === normRoot;
  const canGoUp = !isRoot && parentPath;

  const MAX_SEGMENTS = 5;
  const showEllipsis = pathSegments.length > MAX_SEGMENTS;
  const visibleSegments = showEllipsis
    ? pathSegments.slice(-MAX_SEGMENTS)
    : pathSegments;

  const buildAbsolutePath = (relativePath: string) => {
    if (!normRoot) return relativePath;
    if (normRoot.endsWith("/")) return normRoot.slice(0, -1) + relativePath;
    return normRoot + relativePath;
  };

  const disabled = loading || uploading;

  // ── Empty / no-device state ────────────────────────────────────────────────
  if (!activeDeviceIP) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-bg-base text-[#3d4d63]">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#1e2535] flex items-center justify-center">
            <Layers size={32} strokeWidth={1} />
          </div>
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
            <span className="text-[8px] text-accent font-bold">?</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#8090a8]">
            No device selected
          </p>
          <p className="text-[12px] text-[#3d4d63] mt-1">
            Connect a device from the sidebar to browse files
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col bg-bg-base overflow-hidden relative h-full min-h-0 w-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ── Drag Overlay ──────────────────────────────────────────────────── */}
      {isDragging && <div className="absolute inset-0 z-40 bg-transparent" />}
      {isDragging && (
        <div className="absolute inset-3 z-50 rounded-2xl border-2 border-dashed border-accent/60 bg-accent/5 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center">
            <CloudUpload size={28} className="text-accent" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-accent">
              Drop to upload
            </p>
            <p className="text-[12px] text-accent/60 mt-0.5">
              Files will be uploaded to {displayPath}
            </p>
          </div>
        </div>
      )}

      {/* ── Create Folder Modal ───────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="absolute inset-0 z-100 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-[#1e2535] rounded-xl w-full max-w-sm shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-[14px] font-semibold text-[#dde4f0] mb-1">
              Create New Folder
            </h3>
            <p className="text-[11px] text-[#8090a8] mb-4">
              Enter a name for the new folder. Spaces are supported.
            </p>

            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                setFolderError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateFolderSubmit();
                }
                if (e.key === "Escape") {
                  setShowCreateModal(false);
                  setNewFolderName("");
                }
              }}
              placeholder="e.g. Vacation Photos"
              className="w-full px-3 py-2 bg-bg-base border border-[#1e2535] rounded-lg text-[13px] text-[#dde4f0] placeholder-[#3d4d63] outline-none focus:border-[#00c9a7] focus:ring-1 focus:ring-[#00c9a7]/20 transition-all mb-4"
            />
            <div className="text-red-700 text-[12px] font-semibold -mt-2">
              {folderError}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFolderName("");
                  setFolderError("");
                }}
                className="px-4 py-1.5 text-[12px] font-medium text-[#8090a8] hover:text-[#dde4f0] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleCreateFolderSubmit();
                }}
                disabled={!newFolderName.trim() || loading}
                className="px-4 py-1.5 bg-[#00c9a7]/10 border border-[#00c9a7]/30 text-[#00c9a7] rounded-lg text-[12px] font-medium hover:bg-[#00c9a7]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin inline mr-1" />
                ) : null}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e2535] bg-surface/60 shrink-0">
        <button
          onClick={() => onNavigate(parentPath || "/")}
          disabled={!canGoUp || disabled}
          className="p-1.5 rounded-lg text-[#3d4d63] border border-transparent hover:text-[#dde4f0] hover:bg-panel hover:border-[#1e2535] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          <ChevronUp size={16} />
        </button>

        {/* ── Breadcrumb ── */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto hide-scrollbar min-w-0">
          <button
            onClick={() => onNavigate("/")}
            className="text-[11px] font-mono text-[#3d4d63] hover:text-accent transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-accent/8"
          >
            /
          </button>

          {showEllipsis && (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[#1e2535] text-[11px]">/</span>
              <span className="text-[11px] font-mono px-1 py-0.5 text-[#8090a8] select-none">
                ...
              </span>
            </span>
          )}

          {visibleSegments.map((seg, i) => {
            const originalIndex =
              pathSegments.length - visibleSegments.length + i;
            const relativeSegPath =
              "/" + pathSegments.slice(0, originalIndex + 1).join("/");
            const absoluteSegPath = buildAbsolutePath(relativeSegPath);
            const isLast = originalIndex === pathSegments.length - 1;

            return (
              <span
                key={originalIndex}
                className="flex items-center gap-1 shrink-0 min-w-0"
              >
                <span className="text-[#1e2535] text-[11px]">/</span>
                <button
                  onClick={() => !isLast && onNavigate(absoluteSegPath)}
                  title={seg}
                  className={`
                    text-[11px] font-mono px-1 py-0.5 rounded transition-colors truncate max-w-30
                    ${
                      isLast
                        ? "text-[#dde4f0] cursor-default"
                        : "text-[#3d4d63] hover:text-accent hover:bg-accent/8 cursor-pointer"
                    }
                  `}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onNavigate(currentPath)}
            disabled={disabled}
            className="p-1.5 rounded-lg text-[#3d4d63] border border-transparent hover:text-[#dde4f0] hover:bg-panel hover:border-[#1e2535] disabled:opacity-30 transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="w-px h-4 bg-[#1e2535]" />

          <button
            onClick={onUploadFiles}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-accent bg-accent/8 border border-accent/25 hover:bg-accent/15 hover:border-accent/40 disabled:opacity-40 transition-all"
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}{" "}
            Files
          </button>

          {/* ── Folder Dropdown Menu ── */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowFolderMenu(!showFolderMenu)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#00c9a7] bg-[#00c9a7]/8 border border-[#00c9a7]/25 hover:bg-[#00c9a7]/15 hover:border-[#00c9a7]/40 disabled:opacity-40 transition-all"
            >
              <FolderUp size={12} /> Folder
            </button>

            {showFolderMenu && (
              <div className="absolute top-full right-0 mt-1.5 w-44 bg-panel border border-[#1e2535] rounded-xl shadow-2xl py-1.5 px-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => {
                    setShowFolderMenu(false);
                    onUploadFolder();
                  }}
                  className="w-full rounded-lg flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-[#dde4f0] hover:bg-[#00c9a7]/10 hover:text-[#00c9a7] transition-colors"
                >
                  <FolderUp size={13} /> Upload Folder
                </button>
                <div className="h-px w-full bg-[#1e2535] my-1" />
                <button
                  onClick={() => {
                    setShowFolderMenu(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full rounded-lg flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-[#dde4f0] hover:bg-accent/10 hover:text-accent transition-colors"
                >
                  <FolderPlus size={13} /> Create Folder
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_100px_80px] px-5 py-2 border-b border-[#1e2535] bg-surface/40 shrink-0">
        {["Name", "Size", ""].map((col, i) => (
          <span
            key={i}
            className="text-[9px] font-bold tracking-[0.12em] uppercase text-[#3d4d63]"
          >
            {col}
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && files.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-[#3d4d63]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}
        {!loading && files.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-[#3d4d63]">
            <span className="text-3xl">📭</span>
            <p className="text-[12px]">This folder is empty</p>
          </div>
        )}
        {files.map((file, idx) => (
          <FileRow
            key={`${file.path}-${idx}`}
            file={file}
            onNavigate={onNavigate}
            onDownload={onDownload}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

interface FileRowProps {
  file: FileInfo;
  onNavigate: (path: string) => void;
  onDownload: (file: FileInfo) => void;
  disabled: boolean;
}

function FileRow({ file, onNavigate, onDownload, disabled }: FileRowProps) {
  const iconColor = fileIconColor(file.name, file.isDir);

  return (
    <div
      className="group grid grid-cols-[1fr_100px_80px] items-center px-5 py-2.5 min-h-11 border-b border-[#1e2535]/50 hover:bg-surface/80 transition-colors duration-100 cursor-default"
      onClick={() => file.isDir && !disabled && onNavigate(file.path)}
      style={{ cursor: file.isDir ? "pointer" : "default" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileIcon
          name={file.name}
          isDir={file.isDir}
          size={15}
          strokeWidth={1.5}
          style={{ color: iconColor, flexShrink: 0 }}
        />
        <span
          className={`text-[13px] truncate leading-none ${file.isDir ? "text-[#dde4f0] font-medium group-hover:text-accent" : "text-[#8090a8] group-hover:text-[#dde4f0]"} transition-colors`}
        >
          {file.name}
        </span>
      </div>
      <span className="text-[11px] font-mono text-[#3d4d63]">
        {file.isDir ? "—" : formatSize(file.size)}
      </span>
      <div className="flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file);
          }}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#3d4d63] border border-transparent opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent/8 hover:border-accent/25 disabled:pointer-events-none transition-all duration-150"
        >
          <Download size={11} />
          {file.isDir ? "Zip" : "Get"}
        </button>
      </div>
    </div>
  );
}
