import { Copy, Minus, Plus, Square, X } from "lucide-react";
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
    // 1. Get the OS platform
    Environment().then((env) => setOs(env.platform));

    // 2. Function to check window state with Wails
    const checkMaximized = () => {
      WindowIsMaximised().then(setIsMaximised);
    };

    // Check immediately on mount
    checkMaximized();

    // 3. Listen to window resizes (catches dragging to screen edge & double clicks)
    window.addEventListener("resize", checkMaximized);
    return () => window.removeEventListener("resize", checkMaximized);
  }, []);

  const isMac = os === "darwin";

  return (
    <div
      className={`h-10 w-full bg-bg-base flex items-center shrink-0 select-none border-b border-[#1e2535] relative ${
        isMac ? "justify-start" : "justify-between"
      }`}
      data-wails-drag
      style={{ "--wails-draggable": "drag" } as any}
      onDoubleClick={WindowToggleMaximise} // Optional: Native feel for double-clicking title bar!
    >
      {/* ── MAC CONTROLS (Left side) ── */}
      {isMac && (
        <div
          className="flex items-center h-full px-4 gap-2"
          style={{ "--wails-draggable": "no-drag" } as any}
        >
          <button
            onClick={Quit}
            className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center transition-colors"
          >
            <X
              size={8}
              strokeWidth={3}
              className="opacity-0 hover:opacity-100 text-[#4d0000]"
            />
          </button>

          <button
            onClick={WindowMinimise}
            className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center transition-colors"
          >
            <Minus
              size={8}
              strokeWidth={3}
              className="opacity-0 hover:opacity-100 text-[#5a3e00]"
            />
          </button>

          <button
            onClick={WindowToggleMaximise}
            className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center transition-colors"
          >
            <Plus
              size={8}
              strokeWidth={3}
              className="opacity-0 hover:opacity-100 text-[#004d09]"
            />
          </button>
        </div>
      )}

      {/* ── TITLE / LOGO AREA ── */}
      <div
        className={`flex items-center gap-2.5 ${isMac ? "pl-0 pr-4" : "px-4"}`}
      >
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
      {!isMac && os !== "" && (
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
            {/* Swap the icon based on the true state of the window */}
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
