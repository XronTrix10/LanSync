import {
  CloudUpload,
  FolderPlus,
  FolderUp,
  Layers,
  Loader2,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileInfo } from "../types";
import { BrowserToolbar } from "./BrowserToolbar";
import { CreateFolderModal } from "./CreateFolderModal";
import { FileRow } from "./FileRow";

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
  onShareClipboard: () => void;
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
  onShareClipboard,
  onError,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);

  // ── NEW: Search States ──
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);

  const dragCounter = useRef(0);
  const disabled = loading || uploading;

  // 1. Reset search ONLY when the directory changes
  useEffect(() => {
    setSearchQuery("");
    setIsSearchActive(false);
  }, [currentPath]);

  // 2. Local Filter Engine (Instantly recalculates on type or refresh)
  const displayFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    return files.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [files, searchQuery]);

  // Close FAB menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setShowFabMenu(false);
    if (showFabMenu) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showFabMenu]);

  // ── Drag and drop handlers ──────────────────────────────────────────────────
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeDeviceIP) return;

      dragCounter.current++;
      setIsDragging(true);
    },
    [activeDeviceIP],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      if (!e.dataTransfer) return;

      const validFiles: File[] = [];
      let hasFolder = false;
      let hasLargeFile = false;

      if (e.dataTransfer.items) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (
            item.kind === "file" &&
            typeof item.webkitGetAsEntry === "function"
          ) {
            const entry = item.webkitGetAsEntry();
            if (entry?.isDirectory) {
              hasFolder = true;
            }
          }
        }
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          if (file.size >= 4294967296) {
            hasLargeFile = true;
          } else {
            validFiles.push(file);
          }
        }
      }

      if (hasFolder) {
        onError("Please use the 'Folder' button to upload folders");
        return;
      }
      if (hasLargeFile) {
        onError("One or more files are too large (4GB limit).");
      }
      if (validFiles.length > 0) {
        onDropUpload(validFiles);
      }
    },
    [onDropUpload, onError],
  );

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
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {/* ── Drag Overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-bg-base/75 backdrop-blur-md pointer-events-none transition-all duration-200" />
      )}
      {isDragging && (
        <div className="absolute inset-3 z-50 rounded-2xl border-2 border-dashed border-accent/60 bg-accent/5 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center">
            <CloudUpload size={28} className="text-accent" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-accent">
              Drop to upload
            </p>
          </div>
        </div>
      )}

      <CreateFolderModal
        isOpen={showCreateModal}
        loading={loading}
        existingFiles={files}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(name) => {
          onCreateFolder(name);
          setShowCreateModal(false);
        }}
      />

      <BrowserToolbar
        currentPath={currentPath}
        parentPath={parentPath}
        deviceRootPath={deviceRootPath}
        loading={loading}
        disabled={disabled}
        onNavigate={onNavigate}
        onShareClipboard={onShareClipboard}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSearchActive={isSearchActive}
        setIsSearchActive={setIsSearchActive}
      />

      {/* ── Header Row ── */}
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

      {/* ── File List Area ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin relative pb-20">
        {loading && files.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-[#3d4d63]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && files.length === 0 && !isSearchActive && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[#3d4d63]">
            <span className="text-4xl mb-1">📭</span>
            <p className="text-[13px] text-[#8090a8] font-medium">
              This folder is empty
            </p>
            <p className="text-[11px] text-[#3d4d63]">
              Use the + button below to add files
            </p>
          </div>
        )}

        {/* ── No Search Results State ── */}
        {!loading &&
          files.length > 0 &&
          displayFiles.length === 0 &&
          isSearchActive && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-[#3d4d63]">
              <Search size={32} className="text-[#3d4d63] mb-1 opacity-50" />
              <p className="text-[13px] text-[#8090a8] font-medium">
                No matching files found
              </p>
            </div>
          )}

        {displayFiles.map((file, idx) => (
          <FileRow
            key={`${file.path}-${idx}`}
            file={file}
            onNavigate={onNavigate}
            onDownload={onDownload}
            disabled={disabled}
          />
        ))}
      </div>

      {/* ── Unified Floating Action Button ── */}
      <div
        className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {showFabMenu && (
          <div className="bg-panel border border-[#1e2535] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.5)] py-1.5 px-1.5 w-44 animate-in slide-in-from-bottom-2 fade-in duration-150">
            <button
              onClick={() => {
                setShowFabMenu(false);
                onUploadFiles();
              }}
              className="w-full rounded-lg flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium text-[#dde4f0] hover:bg-accent/10 hover:text-accent transition-colors"
            >
              <Upload size={14} /> Upload Files
            </button>
            <div className="h-px w-full bg-[#1e2535] my-1" />
            <button
              onClick={() => {
                setShowFabMenu(false);
                onUploadFolder();
              }}
              className="w-full rounded-lg flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium text-[#dde4f0] hover:bg-[#00c9a7]/10 hover:text-[#00c9a7] transition-colors"
            >
              <FolderUp size={14} /> Upload Folder
            </button>
            <div className="h-px w-full bg-[#1e2535] my-1" />
            <button
              onClick={() => {
                setShowFabMenu(false);
                setShowCreateModal(true);
              }}
              className="w-full rounded-lg flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium text-[#dde4f0] hover:bg-accent/10 hover:text-accent transition-colors"
            >
              <FolderPlus size={14} /> Create Folder
            </button>
          </div>
        )}

        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          disabled={disabled}
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all duration-200
            ${showFabMenu ? "bg-panel text-accent border border-accent/30" : "bg-accent text-bg-base hover:bg-accent/90 hover:scale-105 border border-transparent"}
            disabled:opacity-50 disabled:scale-100
          `}
        >
          {uploading ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Plus size={24} className={showFabMenu ? "rotate-45": "" + " transition-all duration-200"} />
          )}
        </button>
      </div>
    </div>
  );
}
