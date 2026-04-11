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
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-sm font-semibold text-text mb-1">
          Create New Folder
        </h3>
        <p className="text-[11px] text-light mb-4">
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
          className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text placeholder-dull outline-none focus:border-accent focus:ring-1 focus:ring-gold/20 transition-all mb-4"
        />
        <div className="text-red-700 text-[11px] font-semibold -mt-3 ml-1">
          {folderError}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 font-medium text-light hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newFolderName.trim() || loading}
            className="px-4 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-lg font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading && <Loader2 size={12} className="animate-spin mr-1.5" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
