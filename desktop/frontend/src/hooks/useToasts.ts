import { useCallback, useRef, useState } from "react";
import type { Toast } from "../types";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const showToast = useCallback(
    (message: string, type: "success" | "error", path?: string) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, message, type, path }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timerRef.current.delete(id);
      }, 6000);
      timerRef.current.set(id, timer);
    },
    [],
  );

  return { toasts, showToast };
}
