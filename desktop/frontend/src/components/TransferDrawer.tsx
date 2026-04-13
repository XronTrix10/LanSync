import { ArrowDownToLine, Clock, Zap, XCircle } from "lucide-react";
import type { TransferProgress } from "../types";
import { formatETA, formatSize } from "../types";

interface Props {
  transfers: Record<string, TransferProgress>;
  onCancelAll?: () => void;
}

export function TransferDrawer({ transfers, onCancelAll }: Props) {
  const items = Object.values(transfers);
  if (items.length === 0) return null;

  return (
    <div className="shrink-0 bg-surface/95 rounded-t-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-border">
        <ArrowDownToLine size={13} className="text-accent" />
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-light">
          Active Transfers
        </span>
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/15 text-accent text-[10px] font-bold font-mono">
          {items.length}
        </span>

        {/* The Cancel All Button */}
        {onCancelAll && (
          <button
            onClick={onCancelAll}
            className="ml-auto text-red-400 hover:text-red-500 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
          >
            <XCircle size={14} /> Cancel
          </button>
        )}
      </div>

      {/* Transfer items */}
      <div className="flex flex-col gap-2 px-5 py-3 max-h-52 overflow-y-auto scrollbar-thin">
        {items.map((t) => (
          <div key={t.id} className="flex flex-col gap-1.5">
            {/* File name + percent */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text font-medium truncate">
                {t.filename}
              </span>
              <span className="text-xs font-mono text-accent shrink-0 tabular-nums">
                {t.percent}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${t.percent}%`,
                  background:
                    "linear-gradient(90deg, #F58E2F 0%, #FFDF00 100%)",
                  boxShadow: `0 0 8px rgba(61,158,255,0.4)`,
                }}
              />
            </div>

            {/* Speed + ETA */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-light">
                <Zap size={9} className="text-accent" />
                {t.speedMBps.toFixed(1)} MB/s
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-light">
                <Clock size={9} />
                {formatETA(t.etaSeconds)}
              </span>
              <span className="text-[10px] font-mono text-dull ml-auto tabular-nums">
                {formatSize(t.transferred)} / {formatSize(t.total)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
