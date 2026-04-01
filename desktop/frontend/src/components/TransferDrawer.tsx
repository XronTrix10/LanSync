import { ArrowDownToLine, Zap, Clock } from "lucide-react";
import type { TransferProgress } from "../types";
import { formatETA } from "../types";

interface Props {
  transfers: Record<string, TransferProgress>;
}

export function TransferDrawer({ transfers }: Props) {
  const items = Object.values(transfers);
  if (items.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[#1e2535] bg-surface/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-[#1e2535]">
        <ArrowDownToLine size={13} className="text-accent" />
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#8090a8]">
          Active Transfers
        </span>
        <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-[#3d9eff]/15 text-[#3d9eff] text-[10px] font-bold font-mono">
          {items.length}
        </span>
      </div>

      {/* Transfer items */}
      <div className="flex flex-col gap-2 px-5 py-3 max-h-52 overflow-y-auto scrollbar-thin">
        {items.map((t) => (
          <div key={t.id} className="flex flex-col gap-1.5">
            {/* File name + percent */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[#dde4f0] font-medium truncate">
                {t.filename}
              </span>
              <span className="text-xs font-mono text-[#3d9eff] shrink-0 tabular-nums">
                {t.percent}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full bg-[#1e2535] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${t.percent}%`,
                  background:
                    "linear-gradient(90deg, #3d9eff 0%, #00c9a7 100%)",
                  boxShadow: `0 0 8px rgba(61,158,255,0.4)`,
                }}
              />
            </div>

            {/* Speed + ETA */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#8090a8]">
                <Zap size={9} className="text-[#3d9eff]" />
                {t.speedMBps.toFixed(1)} MB/s
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#8090a8]">
                <Clock size={9} />
                {formatETA(t.etaSeconds)}
              </span>
              <span className="text-[10px] font-mono text-[#3d4d63] ml-auto tabular-nums">
                {(t.transferred / 1024 / 1024).toFixed(1)} /{" "}
                {(t.total / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
