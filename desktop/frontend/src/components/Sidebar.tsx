import {
  History,
  Loader2,
  Monitor,
  Plus,
  Server,
  Settings,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import type { Device } from "../types";
import { getOSLabel } from "../types";
import IPInput from "./IPInput";

interface Props {
  localDeviceName: string;
  localIPs: string[];
  devices: Device[];
  activeDeviceIP: string | null;
  recentDevices: Device[];
  newDeviceIP: string;
  loading: boolean;
  onSetActiveDevice: (ip: string) => void;
  onDisconnect: (ip: string) => void;
  onNewDeviceIPChange: (ip: string) => void;
  onConnect: (ip?: string) => void;
  onRemoveRecent: (ip: string) => void;
  setShowSettings: (show: boolean) => void;
}

// ── Icons ───────────────────────────────────────────────────────────────────
function DeviceIcon({ os, size = 16 }: { os: string; size?: number }) {
  const lower = os?.toLowerCase();
  if (lower === "android") return <Smartphone size={size} />;
  if (lower === "windows" || lower === "darwin" || lower === "linux")
    return <Monitor size={size} />;
  return <Server size={size} />;
}

// ── Sidebar Component ───────────────────────────────────────────────────────
export function Sidebar({
  localDeviceName,
  localIPs,
  devices,
  activeDeviceIP,
  recentDevices,
  newDeviceIP,
  loading,
  onSetActiveDevice,
  onDisconnect,
  onNewDeviceIPChange,
  onConnect,
  onRemoveRecent,
  setShowSettings,
}: Props) {
  // A valid IP means all 4 boxes have at least one digit in them
  const isIPComplete =
    newDeviceIP.split(".").filter((seg) => seg !== "").length === 4;

  // Filter out currently connected devices from the recent list
  const unconnectedRecent = recentDevices.filter(
    (recent) => !devices.some((connected) => connected.ip === recent.ip),
  );

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-surface border-r border-[#1e2535]">
      {/* ── Logo & IPs ── */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1e2535]">
        <div
          className="text-[14px] font-black tracking-widest mb-3 select-none truncate text-accent"
          title={localDeviceName || "My Device"}
        >
          {localDeviceName || "My Device"}
        </div>

        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1.5">
            {localIPs.map((ip, _index) => (
              <div
                key={ip}
                className="flex items-center gap-2"
                title={`IP: ${ip}`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00c9a7] opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00c9a7]" />
                </span>

                <span className="text-[11px] font-mono text-[#8090a8] truncate">
                  {ip}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-white">
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* ── Connected Devices ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-[#3d4d63] px-2 mb-2">
          Connected
        </p>

        {devices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-[#3d4d63]">
            <Wifi size={22} strokeWidth={1.5} />
            <span className="text-[11px]">No devices connected</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {devices.map((device) => {
              const isActive = activeDeviceIP === device.ip;
              return (
                <button
                  key={device.ip}
                  onClick={() => onSetActiveDevice(device.ip)}
                  className={`
                    group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg
                    border transition-all duration-150 relative overflow-hidden
                    ${isActive
                      ? "bg-accent/8 border-accent/30"
                      : "bg-transparent border-transparent hover:bg-panel hover:border-[#1e2535]"
                    }
                  `}
                >
                  {/* Active left glow bar */}
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent shadow-[0_0_8px_#3d9eff]" />
                  )}

                  {/* Device icon */}
                  <span
                    className={`shrink-0 ${isActive ? "text-accent" : "text-[#3d4d63] group-hover:text-[#8090a8]"}`}
                  >
                    <DeviceIcon os={device.os} size={15} />
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[12px] font-semibold truncate leading-tight ${isActive ? "text-[#dde4f0]" : "text-[#8090a8] group-hover:text-[#dde4f0]"}`}
                    >
                      {device.deviceName}
                    </p>
                    <p className="text-[10px] font-mono text-[#3d4d63] truncate">
                      {device.ip.split(":")[0]}
                    </p>
                  </div>

                  {/* OS badge */}
                  <span className="text-[9px] font-bold tracking-wider font-mono text-[#3d4d63] bg-panel border border-[#1e2535] px-1.5 py-0.5 rounded shrink-0">
                    {getOSLabel(device.os)}
                  </span>

                  {/* Disconnect button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(device.ip);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#3d4d63] hover:text-[#f04a6a] hover:bg-[#f04a6a]/10 transition-all ml-0.5 shrink-0"
                    title="Disconnect"
                  >
                    <X size={12} />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Device ── */}
      <div className="px-3 pb-3 border-t border-[#1e2535] pt-3 flex flex-col gap-3">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-[#3d4d63] px-2">
          Add Device
        </p>

        {/* IP Input */}
        <div className="flex flex-col gap-2">
          <IPInput
            value={newDeviceIP}
            onChange={onNewDeviceIPChange}
            onEnter={() => isIPComplete && onConnect(newDeviceIP)}
          />
          <button
            onClick={() => onConnect(newDeviceIP)}
            disabled={loading || !isIPComplete}
            className="
              flex items-center justify-center gap-2 w-full py-2
              text-[12px] font-semibold rounded-lg transition-all
              bg-accent/10 border border-accent/30 text-accent
              hover:bg-accent/18 hover:border-accent/50
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>

        {/* Recent devices */}
        {unconnectedRecent.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="flex items-center gap-1.5 px-2 mb-0.5">
              <History size={9} className="text-[#3d4d63]" />
              <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-[#3d4d63]">
                Recent
              </span>
            </div>

            {unconnectedRecent.map((device) => (
              <div
                key={device.ip}
                onClick={() => onConnect(device.ip)}
                title="Connect"
                className="
                  group flex items-center gap-2.5 px-3 py-2 rounded-lg
                  transition-all text-left w-full border cursor-pointer 
                  bg-transparent hover:bg-panel border-transparent hover:border-[#1e2535]
                "
              >
                <span className="text-[#3d4d63] group-hover:text-[#8090a8]">
                  <DeviceIcon os={device.os} size={12} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[#8090a8] truncate leading-none mb-0.5 group-hover:text-[#dde4f0]">
                    {device.deviceName}
                  </p>
                  <p className="text-[10px] font-mono text-[#3d4d63] truncate">
                    {device.ip.split(":")[0]}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(device.ip);
                  }}
                  title="Remove from history"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#3d4d63] hover:text-[#f04a6a] transition-all cursor-pointer"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
