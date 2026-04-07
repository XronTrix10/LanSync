import { ShieldAlert } from "lucide-react";
import type { ConnectionRequest } from "../types";

interface Props {
  request: ConnectionRequest | null;
  onAccept: () => void;
  onReject: () => void;
}

export function ConnectionRequestModal({ request, onAccept, onReject }: Props) {
  if (!request) return null;

  return (
    <div className="absolute inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 border border-accent/20">
          <ShieldAlert size={28} className="text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-text mb-1">
          Connection Request
        </h3>
        <p className="text-sm text-light mb-6">
          <strong>{request.deviceName}</strong>{" "}
          <span className="text-dull">(
            {request.ip})</span><br />
          wants to connect
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-light hover:text-text transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 bg-accent/10 border border-accent/30 text-accent rounded-lg text-[12px] font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
