import { ChevronUp, ClipboardPaste, RefreshCw, Search, X } from "lucide-react";

interface Props {
  currentPath: string;
  parentPath: string;
  deviceRootPath: string;
  loading: boolean;
  disabled: boolean;
  onNavigate: (path: string) => void;
  onShareClipboard: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchActive: boolean;
  setIsSearchActive: (active: boolean) => void;
}

export function BrowserToolbar({
  currentPath,
  parentPath,
  deviceRootPath,
  loading,
  disabled,
  onNavigate,
  onShareClipboard,
  searchQuery,
  setSearchQuery,
  isSearchActive,
  setIsSearchActive,
}: Props) {
  // ── Path Calculations ──
  const normPath = currentPath ? currentPath.replace(/\\/g, "/") : "";
  const normRoot = deviceRootPath ? deviceRootPath.replace(/\\/g, "/") : "";

  let displayPath = normPath;
  if (normRoot && normPath.startsWith(normRoot)) {
    displayPath = normPath.substring(normRoot.length);
  }
  if (!displayPath.startsWith("/")) displayPath = "/" + displayPath;

  const pathSegments = displayPath.split("/").filter(Boolean);
  const isRoot = normPath === normRoot;
  const canGoUp = !isRoot && parentPath;

  const MAX_SEGMENTS = 5;
  const showEllipsis = pathSegments.length > MAX_SEGMENTS;
  const visibleSegments = showEllipsis
    ? pathSegments.slice(-MAX_SEGMENTS)
    : pathSegments;

  const buildAbsolutePath = (relativePath: string) => {
    if (!normRoot) return relativePath;
    if (normRoot.endsWith("/")) return normRoot.slice(0, -1) + relativePath;
    return normRoot + relativePath;
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e2535] bg-surface/60 shrink-0 h-12">
      <button
        onClick={() => onNavigate(parentPath || "/")}
        disabled={!canGoUp || disabled}
        className="p-1.5 rounded-lg text-[#3d4d63] border border-transparent hover:text-[#dde4f0] hover:bg-panel hover:border-[#1e2535] disabled:opacity-25 disabled:cursor-not-allowed transition-all"
      >
        <ChevronUp size={16} />
      </button>

      {/* ── DYNAMIC AREA: Search Input OR Breadcrumbs ── */}
      {isSearchActive ? (
        <div className="flex-1 flex items-center gap-2 px-2 bg-bg-base/50 border border-accent/30 rounded-lg h-full">
          <Search size={14} className="text-accent shrink-0" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search locally..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[#dde4f0] placeholder-[#3d4d63] min-w-0"
          />
          <button
            onClick={() => {
              setSearchQuery("");
              setIsSearchActive(false);
            }}
            className="p-1 text-[#8090a8] hover:text-[#dde4f0] rounded"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1 overflow-x-auto hide-scrollbar min-w-0">
          <button
            onClick={() => onNavigate("/")}
            className="text-[11px] font-mono text-[#3d4d63] hover:text-accent transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-accent/8"
          >
            /
          </button>

          {showEllipsis && (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[#1e2535] text-[11px]">/</span>
              <span className="text-[11px] font-mono px-1 py-0.5 text-[#8090a8] select-none">
                ...
              </span>
            </span>
          )}

          {visibleSegments.map((seg, i) => {
            const originalIndex =
              pathSegments.length - visibleSegments.length + i;
            const relativeSegPath =
              "/" + pathSegments.slice(0, originalIndex + 1).join("/");
            const absoluteSegPath = buildAbsolutePath(relativeSegPath);
            const isLast = originalIndex === pathSegments.length - 1;

            return (
              <span
                key={originalIndex}
                className="flex items-center gap-1 shrink-0 min-w-0"
              >
                <span className="text-[#1e2535] text-[11px]">/</span>
                <button
                  onClick={() => !isLast && onNavigate(absoluteSegPath)}
                  title={seg}
                  className={`
                    text-[11px] font-mono px-1 py-0.5 rounded transition-colors truncate max-w-30
                    ${isLast ? "text-[#dde4f0] cursor-default" : "text-[#3d4d63] hover:text-accent hover:bg-accent/8 cursor-pointer"}
                  `}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onNavigate(currentPath)}
          disabled={disabled}
          className="p-1.5 rounded-lg text-[#3d4d63] border border-transparent hover:text-[#dde4f0] hover:bg-panel hover:border-[#1e2535] disabled:opacity-30 transition-all"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <div className="w-px h-4 bg-[#1e2535]" />

        <button
          onClick={onShareClipboard}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#a78bfa] bg-[#a78bfa]/8 border border-[#a78bfa]/25 hover:bg-[#a78bfa]/15 hover:border-[#a78bfa]/40 disabled:opacity-40 transition-all"
        >
          <ClipboardPaste size={12} /> Share
        </button>

        {/* ── Search Trigger Button ── */}
        {!isSearchActive && (
          <button
            onClick={() => setIsSearchActive(true)}
            disabled={disabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#00c9a7] bg-[#00c9a7]/8 border border-[#00c9a7]/25 hover:bg-[#00c9a7]/15 hover:border-[#00c9a7]/40 disabled:opacity-40 transition-all"
          >
            <Search size={12} /> Search
          </button>
        )}
      </div>
    </div>
  );
}
