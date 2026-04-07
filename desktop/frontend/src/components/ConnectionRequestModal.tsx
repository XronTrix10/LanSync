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
      <div className="bg-surface border border-accent/30 rounded-2xl w-full max-w-sm shadow-[0_0_40px_rgba(61,158,255,0.1)] p-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4 border border-accent/20">
          <ShieldAlert size={28} className="text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-[#dde4f0] mb-1">
          Connection Request
        </h3>
        <p className="text-sm text-[#8090a8] mb-6">
          <strong className="text-[#dde4f0]">{request.deviceName}</strong> (
          {request.ip}) wants to connect.
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onReject}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#f04a6a] bg-[#f04a6a]/10 hover:bg-[#f04a6a]/20 transition-all"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#00c9a7] bg-[#00c9a7]/10 hover:bg-[#00c9a7]/20 transition-all"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
