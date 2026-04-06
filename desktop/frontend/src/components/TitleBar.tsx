import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Environment,
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from "../../wailsjs/runtime/runtime";

import logoImage from "../assets/images/lanSync.png";

export function TitleBar() {
  const [os, setOs] = useState<string>("");
  const [isMaximised, setIsMaximised] = useState<boolean>(false);

  useEffect(() => {
    Environment().then((env) => setOs(env.platform));

    const checkMaximized = () => {
      WindowIsMaximised().then(setIsMaximised);
    };

    checkMaximized();
    window.addEventListener("resize", checkMaximized);
    return () => window.removeEventListener("resize", checkMaximized);
  }, []);

  const isMac = os === "darwin";

  if (os === "") return null;

  return (
    <div
      // ── Added pl-[80px] for Mac to avoid the native traffic lights! ──
      className={`h-8 w-full bg-bg-base flex items-center shrink-0 select-none border-b border-[#1e2535] relative ${
        isMac ? "pl-20 justify-start" : "px-4 justify-between"
      }`}
      data-wails-drag
      style={{ "--wails-draggable": "drag" } as any}
      onDoubleClick={WindowToggleMaximise}
    >
      {/* ── TITLE / LOGO AREA ── */}
      <div className={`flex items-center gap-2.5`}>
        <img
          src={logoImage}
          alt="LanSync Logo"
          className="w-5 h-5 object-contain pointer-events-none"
          draggable="false"
        />
        <div className="text-md font-black tracking-[0.2em]">
          <span className="text-[#3d4d63]">Lan</span>
          <span className="text-[#00c9a7]">Sync</span>
        </div>
      </div>

      {/* ── WINDOWS / LINUX CONTROLS (Right side) ── */}
      {/* (Hidden entirely on Mac because the OS handles the window buttons natively) */}
      {!isMac && (
        <div
          className="flex h-full"
          style={{ "--wails-draggable": "no-drag" } as any}
        >
          <button
            onClick={WindowMinimise}
            className="h-full aspect-square flex items-center justify-center text-[#8090a8] hover:bg-panel hover:text-[#dde4f0] transition-colors"
          >
            <Minus size={14} />
          </button>

          <button
            onClick={WindowToggleMaximise}
            className="h-full aspect-square flex items-center justify-center text-[#8090a8] hover:bg-panel hover:text-[#dde4f0] transition-colors"
          >
            {isMaximised ? <Copy size={12} /> : <Square size={12} />}
          </button>

          <button
            onClick={Quit}
            className="h-full aspect-square flex items-center justify-center text-[#8090a8] hover:bg-[#f04a6a] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}