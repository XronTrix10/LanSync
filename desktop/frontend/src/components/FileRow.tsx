import { Download } from "lucide-react";
import type { FileInfo } from "../types";
import { formatSize } from "../types";
import { FileIcon, fileIconColor } from "./FileIcon";

interface FileRowProps {
  file: FileInfo;
  onNavigate: (path: string) => void;
  onDownload: (file: FileInfo) => void;
  disabled: boolean;
}

export function FileRow({
  file,
  onNavigate,
  onDownload,
  disabled,
}: FileRowProps) {
  const iconColor = fileIconColor(file.name, file.isDir);

  return (
    <div
      className="group grid grid-cols-[1fr_80px_60px] items-center px-5 py-2.5 min-h-11 border-b border-border/50 hover:bg-surface/80 transition-colors duration-100 cursor-default"
      onClick={() => file.isDir && !disabled && onNavigate(file.path)}
      style={{ cursor: file.isDir ? "pointer" : "default" }}
    >
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <FileIcon
          name={file.name}
          isDir={file.isDir}
          size={15}
          strokeWidth={1.5}
          style={{ color: iconColor, flexShrink: 0 }}
        />
        <span
          className={`text-sm truncate transition-colors ${
            file.isDir
              ? "text-text font-medium group-hover:text-light"
              : "text-light group-hover:text-text"
          }`}
        >
          {file.name}
        </span>
      </div>
      <span className="text-[11px] font-mono text-dull">
        {file.isDir ? "—" : formatSize(file.size)}
      </span>
      <div className="flex justify-end">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file);
          }}
          disabled={disabled}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-dull border border-transparent opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent/8 hover:border-accent/25 disabled:pointer-events-none transition-all duration-150"
        >
          <Download size={11} />
          Get
        </button>
      </div>
    </div>
  );
}
