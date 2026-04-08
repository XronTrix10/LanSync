import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Environment,
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
  WindowIsFullscreen,
  EventsOn,
  EventsOff,
} from "../../wailsjs/runtime/runtime";

import logoImage from "../assets/images/lanSync.png";

export function TitleBar() {
  const [os, setOs] = useState<string>("");
  const [isMaximised, setIsMaximised] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    Environment().then((env) => setOs(env.platform));

    const checkWindowState = () => {
      WindowIsMaximised().then(setIsMaximised);
      WindowIsFullscreen().then(setIsFullscreen);
    };

    // Initial check and resize listener
    checkWindowState();
    window.addEventListener("resize", checkWindowState);

    // ── Listen to native OS Fullscreen events (Crucial for macOS) ──
    EventsOn("wails:WindowFullscreen", () => setIsFullscreen(true));
    EventsOn("wails:WindowUnFullscreen", () => setIsFullscreen(false));

    return () => {
      window.removeEventListener("resize", checkWindowState);
      EventsOff("wails:WindowFullscreen");
      EventsOff("wails:WindowUnFullscreen");
    };
  }, []);

  const isMac = os === "darwin";

  if (os === "") return null;

  return (
    <div
      className={`h-8 w-full bg-bg-base flex items-center shrink-0 select-none border-border relative transition-all ${
        isMac && !isFullscreen ? "pl-20 justify-start" : "pl-6 justify-between"
      }`}
      data-wails-drag
      style={{ "--wails-draggable": "drag" } as any}
      onDoubleClick={WindowToggleMaximise}
    >
      {/* ── TITLE / LOGO AREA ── */}
      <div className={`flex items-center gap-1`}>
        <img
          src={logoImage}
          alt="LanSync Logo"
          className="w-5 h-5 object-contain pointer-events-none"
          draggable="false"
        />
        <div className="text-md font-black tracking-widest">
          <span className="text-dull">LAN</span>
          <span className="text-light">Sync</span>
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
            className="h-full aspect-square flex items-center justify-center text-light hover:bg-panel hover:text-text transition-colors"
          >
            <Minus size={14} />
          </button>

          <button
            onClick={WindowToggleMaximise}
            className="h-full aspect-square flex items-center justify-center text-light hover:bg-panel hover:text-text transition-colors"
          >
            {isMaximised ? <Copy size={12} /> : <Square size={12} />}
          </button>

          <button
            onClick={Quit}
            className="h-full aspect-square flex items-center justify-center text-light hover:bg-red hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
