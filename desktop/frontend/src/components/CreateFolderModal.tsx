import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { FileInfo } from "../types";

interface Props {
  isOpen: boolean;
  loading: boolean;
  existingFiles: FileInfo[];
  onClose: () => void;
  onSubmit: (folderName: string) => void;
}

export function CreateFolderModal({
  isOpen,
  loading,
  existingFiles,
  onClose,
  onSubmit,
}: Props) {
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) {
      setFolderError("Provide valid folder name (alphanumeric only)");
      return;
    }

    const folderExists = existingFiles.some(
      (file) => file.isDir && file.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (folderExists) {
      setFolderError("Folder with this name already exists");
      return;
    }

    onSubmit(trimmed);
    setNewFolderName("");
    setFolderError("");
  };

  const handleClose = () => {
    onClose();
    setNewFolderName("");
    setFolderError("");
  };

  return (
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
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") handleClose();
          }}
          placeholder="Vacation Photos"
          className="w-full px-3 py-2 bg-bg-base border border-[#1e2535] rounded-lg text-[13px] text-[#dde4f0] placeholder-[#3d4d63] outline-none focus:border-[#00c9a7] focus:ring-1 focus:ring-[#00c9a7]/20 transition-all mb-4"
        />
        <div className="text-red-700 text-[12px] font-semibold -mt-2">
          {folderError}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 text-[12px] font-medium text-[#8090a8] hover:text-[#dde4f0] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newFolderName.trim() || loading}
            className="px-4 py-1.5 bg-[#00c9a7]/10 border border-[#00c9a7]/30 text-[#00c9a7] rounded-lg text-[12px] font-medium hover:bg-[#00c9a7]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading && <Loader2 size={12} className="animate-spin mr-1.5" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
