// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  modTime: string;
}

export interface TransferProgress {
  id: string;
  filename: string;
  total: number;
  transferred: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
}

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
  path?: string;
}

export interface DiscoveredDevice {
  ip: string;
  deviceName: string;
  os: string;
}

export interface Device extends DiscoveredDevice {
  port: string;
  type: string;
}

// Handshake Request Payload
export interface ConnectionRequest extends Device {
  tokenForB: string;
}

// ─── Utility Formatters ───────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatETA(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function getOSLabel(os: string): string {
  const map: Record<string, string> = {
    windows: "WIN",
    darwin: "MAC",
    linux: "LNX",
    android: "AND",
  };
  return map[os?.toLowerCase()] ?? os?.toUpperCase().slice(0, 3) ?? "???";
}

export function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}
