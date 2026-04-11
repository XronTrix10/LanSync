import {
  GetDeviceName,
  GetSharedDir,
  SelectDirectory,
} from "../../wailsjs/go/main/App";

interface Props {
  isOpen: boolean;
  deviceName: string;
  sharedDir: string;
  homeDir: string;
  setDeviceName: (name: string) => void;
  setSharedDir: (dir: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function SettingsModal({
  isOpen,
  deviceName,
  sharedDir,
  homeDir,
  setDeviceName,
  setSharedDir,
  onClose,
  onSave,
}: Props) {
  if (!isOpen) return null;

  const displayPath = (path: string) => {
    if (homeDir && path === homeDir) return "~/";
    if (homeDir && path.startsWith(homeDir)) {
      return path.replace(homeDir, "~");
    }
    return path;
  };

  const handleCancel = () => {
    onClose();
    // Reset state to saved config if they cancel
    GetSharedDir().then(setSharedDir);
    GetDeviceName().then(setDeviceName);
  };

  return (
    <div className="absolute inset-0 z-100 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-sm font-semibold text-text mb-1">
          Settings
        </h3>
        <p className="text-[11px] text-dull mb-5">
          Customize how this PC appears and operates on your network.
        </p>

        {/* DEVICE NAME FIELD */}
        <div className="mb-4">
          <label className="block text-[10px] font-bold text-dull mb-1.5 uppercase tracking-wider">
            Display Name
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-text placeholder-dull outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
            placeholder="e.g. MacBook Pro"
          />
        </div>

        {/* SHARED FOLDER FIELD */}
        <div className="mb-6">
          <label className="block text-[10px] font-bold text-dull mb-1.5 uppercase tracking-wider">
            Shared Directory
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 px-3 py-2 bg-bg-base border border-border rounded-lg text-sm text-text truncate flex items-center"
              title={sharedDir}
            >
              {displayPath(sharedDir) || "~/"}
            </div>
            <button
              onClick={async () => {
                const selectedPath = await SelectDirectory();
                if (selectedPath) setSharedDir(selectedPath);
              }}
              className="px-3 py-2 bg-border border border-border hover:border-border2 text-text rounded-lg font-medium hover:bg-border2 transition-colors whitespace-nowrap"
            >
              Browse
            </button>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 font-medium text-light hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!deviceName.trim() || !sharedDir.trim()}
            className="px-4 py-1.5 bg-accent/10 border border-accent/30 text-accent rounded-lg font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
