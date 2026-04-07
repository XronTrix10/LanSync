import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File,
  type LucideProps,
} from "lucide-react";
import { getFileExtension } from "../types";

const imageExts = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "svg", "bmp", "ico", "tiff"]);
const videoExts = new Set(["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp"]);
const audioExts = new Set(["mp3", "flac", "wav", "aac", "ogg", "m4a", "opus", "wma"]);
const archiveExts = new Set(["zip", "rar", "tar", "gz", "bz2", "7z", "xz", "dmg", "iso", "apk"]);
const codeExts = new Set(["js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "cs", "php", "rb", "sh", "bash", "json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "sql"]);
const docExts = new Set(["txt", "md", "pdf", "doc", "docx", "rtf", "pages", "odt", "epub"]);
const sheetExts = new Set(["xls", "xlsx", "csv", "numbers", "ods"]);

interface FileIconProps extends LucideProps {
  name: string;
  isDir: boolean;
}

export function FileIcon({ name, isDir, ...props }: FileIconProps) {
  if (isDir) return <Folder {...props} />;

  const ext = getFileExtension(name);

  if (imageExts.has(ext))   return <FileImage {...props} />;
  if (videoExts.has(ext))   return <FileVideo {...props} />;
  if (audioExts.has(ext))   return <FileAudio {...props} />;
  if (archiveExts.has(ext)) return <FileArchive {...props} />;
  if (codeExts.has(ext))    return <FileCode {...props} />;
  if (docExts.has(ext))     return <FileText {...props} />;
  if (sheetExts.has(ext))   return <FileSpreadsheet {...props} />;

  return <File {...props} />;
}

export function fileIconColor(name: string, isDir: boolean): string {
  if (isDir) return "#d76a04";
  const ext = getFileExtension(name);
  if (imageExts.has(ext))   return "#a78bfa";
  if (videoExts.has(ext))   return "#f87171";
  if (audioExts.has(ext))   return "#34d399";
  if (archiveExts.has(ext)) return "#f0a44a";
  if (codeExts.has(ext))    return "#00c9a7";
  if (docExts.has(ext))     return "#93c5fd";
  if (sheetExts.has(ext))   return "#6ee7b7";
  return "#8090a8";
}
