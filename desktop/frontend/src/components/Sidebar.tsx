import {
  History,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Smartphone,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import IPInput from "./IPInput";
import type { Device, DiscoveredDevice } from "../types";

interface Props {
  localDeviceName: string;
  localIPs: string[];
  devices: Device[];
  activeDeviceIP: string | null;
  recentDevices: Device[];
  discoveredDevices: DiscoveredDevice[];
  newDeviceIP: string;
  loading: boolean;
  onSetActiveDevice: (ip: string) => void;
  onDisconnect: (ip: string) => void;
  onNewDeviceIPChange: (ip: string) => void;
  onConnect: (ip?: string) => void;
  onRemoveRecent: (ip: string) => void;
  setShowSettings: (show: boolean) => void;
  onRefresh: () => void;
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
  discoveredDevices,
  newDeviceIP,
  loading,
  onSetActiveDevice,
  onDisconnect,
  onNewDeviceIPChange,
  onConnect,
  onRemoveRecent,
  setShowSettings,
  onRefresh,
}: Props) {
  // A valid IP means all 4 boxes have at least one digit in them
  const isIPComplete =
    newDeviceIP.split(".").filter((seg) => seg !== "").length === 4;

  // Filter out currently connected devices from the recent list
  const unconnectedRecent = recentDevices.filter(
    (rd) => !devices.some((d) => d.ip === rd.ip || d.deviceName === rd.deviceName),
  );

  const availableToConnect = (discoveredDevices || []).filter(
    (d) =>
      !localIPs.includes(d.ip) &&
      !devices.some((con) => con.ip === d.ip || con.deviceName === d.deviceName)
  );

  return (
    <aside className="w-64 shrink-0 flex flex-col gap-y-2 ml-2 mb-2 rounded-xl">
      {/* ── Logo & IPs ── */}
      <div className="px-5 pt-5 pb-4 rounded-xl bg-surface">
        <div className="flex justify-between items-center mb-3">
          <div
            className="text-[14px] font-black tracking-widest select-none truncate text-text"
            title={localDeviceName || "My Device"}
          >
            {localDeviceName || "My Device"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              title="Refresh Network"
              className="text-light hover:text-text transition-colors duration-200"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="text-light hover:text-text transition-colors duration-200"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {localIPs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 bg-red/5 border border-red/20 rounded-lg text-center">
            <WifiOff size={20} className="text-red mb-1.5" />
            <p className="text-[11px] font-bold text-text">No Network</p>
            <p className="text-[9px] text-light mt-0.5">Please connect to a network</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mt-2">
            {localIPs.map((ip, _index) => (
              <div
                key={ip}
                className="flex items-center gap-2"
                title={`IP: ${ip}`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-50" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gold" />
                </span>

                <span className="text-[11px] font-mono text-light truncate">
                  {ip}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Connected Devices ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin rounded-xl bg-surface">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-dull px-2 mb-2">
          Connected
        </p>

        {devices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-dull">
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
                      : "bg-transparent border-transparent hover:bg-panel hover:border-border"
                    }
                  `}
                >
                  {/* Active left glow bar */}
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent shadow-[0_0_8px_#d76a04]" />
                  )}

                  {/* Device icon */}
                  <span
                    className={`shrink-0 ${isActive ? "text-accent" : "text-dull group-hover:text-light"}`}
                  >
                    <DeviceIcon os={device.os} size={16} />
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[12px] font-semibold truncate leading-tight ${isActive ? "text-text" : "text-light group-hover:text-text"}`}
                    >
                      {device.deviceName}
                    </p>
                    <p className="text-[10px] font-mono text-light truncate">
                      {device.ip.split(":")[0]}
                    </p>
                  </div>

                  {/* Disconnect button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(device.ip);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-dull hover:text-red hover:bg-red/10 transition-all ml-0.5 shrink-0"
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

      {/* ── Available Devices ── */}
      <div className="px-3 pb-3 rounded-xl bg-surface pt-3 flex flex-col gap-2">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-dull px-2 mb-1">
          Available Devices
        </p>
        
        {availableToConnect.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-2 text-dull">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="text-[11px] font-medium">Looking for devices...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {availableToConnect.map((device) => (
              <div
                key={device.ip}
                onClick={() => localIPs.length > 0 && onConnect(device.ip)}
                title={localIPs.length > 0 ? "Connect" : "Can't connect"}
                className={`
                  group flex items-center gap-2.5 px-3 py-2 rounded-lg
                  transition-all text-left w-full border hover:border-border border-transparent
                  ${localIPs.length > 0 ? "cursor-pointer bg-transparent hover:bg-panel" : "opacity-50 cursor-not-allowed"}
                `}
              >
                <span className="text-dull group-hover:text-light transition-colors duration-200">
                  <DeviceIcon os={device.os} size={16} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-text truncate group-hover:text-gold transition-colors duration-200">
                    {device.deviceName}
                  </p>
                  <p className="text-[10px] font-mono text-light truncate">
                    {device.ip}
                  </p>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gold/10 p-1 rounded-md">
                  <Plus size={14} className="text-gold" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Manual Device Address ── */}
      <div className="px-3 pb-3 rounded-xl bg-surface pt-3 flex flex-col gap-3">
        <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-dull px-2">
          Manual Connect
        </p>

        {/* IP Input */}
        <div className="flex flex-col gap-2">
          <IPInput
            value={newDeviceIP}
            onChange={onNewDeviceIPChange}
            onEnter={() => isIPComplete && onConnect(newDeviceIP)}
            disabled={localIPs.length === 0}
          />
          <button
            onClick={() => onConnect(newDeviceIP)}
            disabled={loading || !isIPComplete || localIPs.length === 0}
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
              <History size={9} className="text-dull" />
              <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-dull">
                Recent
              </span>
            </div>

            {unconnectedRecent.map((device) => (
              <div
                key={device.ip}
                onClick={() => localIPs.length > 0 && onConnect(device.ip)}
                title={localIPs.length > 0 ? "Connect" : "Can't connect"}
                className={`
                  group flex items-center gap-2.5 px-3 py-2 rounded-lg
                  transition-all text-left w-full border hover:border-border border-transparent
                  ${localIPs.length > 0 ? "cursor-pointer bg-transparent hover:bg-panel" : "opacity-50 cursor-not-allowed"}
                `}
              >
                <span className="text-dull group-hover:text-light transition-colors duration-200">
                  <DeviceIcon os={device.os} size={16} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-light truncate mb-0.5">
                    {device.deviceName}
                  </p>
                  <p className="text-[10px] font-mono text-dull truncate">
                    {device.ip.split(":")[0]}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(device.ip);
                  }}
                  title="Remove from history"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-dull hover:text-red transition-all cursor-pointer"
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
