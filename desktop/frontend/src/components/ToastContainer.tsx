import { CheckCircle, XCircle, FolderOpen } from "lucide-react";
import type { Toast } from "../types";

interface Props {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex flex-col gap-1.5 px-4 py-3
            rounded-xl border backdrop-blur-md shadow-2xl
            min-w-72 max-w-sm
            animate-in slide-in-from-bottom-4 fade-in duration-200
            ${toast.type === "success"
              ? "bg-surface/95 border-gold/30"
              : "bg-surface/95 border-red/30"
            }
          `}
        >
          <div className="flex items-center gap-3">
            {toast.type === "success" ? (
              <CheckCircle size={15} className="text-gold shrink-0" />
            ) : (
              <XCircle size={15} className="text-red shrink-0" />
            )}
            <span className="text-sm font-medium text-text leading-snug">
              {toast.message}
            </span>
          </div>

          {toast.path && (
            <div className="flex items-center gap-2 ml-6 mt-0.5">
              <FolderOpen size={11} className="text-light shrink-0" />
              <span className="text-[11px] font-mono text-light truncate">
                {toast.path}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
