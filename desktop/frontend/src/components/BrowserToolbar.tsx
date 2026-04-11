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
  // 1. Squash backslashes and duplicate forward slashes instantly
  const cleanPath = (p: string) => (p ? p.replace(/\\/g, "/").replace(/\/+/g, "/") : "");

  let normPath = cleanPath(currentPath);
  let normRoot = cleanPath(deviceRootPath);

  // Remove trailing slashes for clean prefix matching (unless it's just "/")
  if (normRoot.length > 1 && normRoot.endsWith("/")) normRoot = normRoot.slice(0, -1);
  if (normPath.length > 1 && normPath.endsWith("/")) normPath = normPath.slice(0, -1);

  let displayPath = normPath;
  if (normRoot && normPath.startsWith(normRoot)) {
    displayPath = normPath.substring(normRoot.length);
  }
  if (!displayPath.startsWith("/")) displayPath = "/" + displayPath;
  displayPath = cleanPath(displayPath); // Final squash to ensure no double slashes formed

  // 2. Break into segments, strictly stripping out empty strings and stray dots (".")
  const pathSegments = displayPath.split("/").filter((seg) => seg.trim().length > 0 && seg !== ".");

  // 3. Determine root state based on segments rather than raw strings
  const isRoot = pathSegments.length === 0;
  const canGoUp = !isRoot && parentPath;

  const MAX_SEGMENTS = 5;
  const showEllipsis = pathSegments.length > MAX_SEGMENTS;
  const visibleSegments = showEllipsis
    ? pathSegments.slice(-MAX_SEGMENTS)
    : pathSegments;

  const buildAbsolutePath = (relativePath: string) => {
    if (!normRoot) return relativePath;
    // Because we stripped the trailing slash from normRoot above, we can safely append relativePath
    return normRoot === "/" ? relativePath : normRoot + relativePath;
  };

  return (
    <div className="flex items-center gap-2 px-2 py-2.5 border-b border-border bg-surface/60 shrink-0 h-12">
      <button
        onClick={() => onNavigate(parentPath || "/")}
        disabled={!canGoUp || disabled}
        title="Goto parent folder"
        className="p-1.5 rounded-lg text-dull border border-transparent hover:text-text hover:bg-panel hover:border-border disabled:opacity-25 disabled:cursor-not-allowed transition-all"
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
            className="flex-1 bg-transparent border-none outline-none text-text placeholder-dull min-w-0"
          />
          <button
            onClick={() => {
              setSearchQuery("");
              setIsSearchActive(false);
            }}
            className="p-1 text-light hover:text-text rounded"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1 overflow-x-auto hide-scrollbar min-w-0">
          {/* ── 1. The Root Button ── */}
          <button
            onClick={() => onNavigate("/")}
            className="text-[11px] font-mono text-dull hover:text-accent transition-colors shrink-0 px-1 py-0.5 rounded hover:bg-accent/8"
          >
            /
          </button>

          {/* ── 2. The Ellipsis (Fixed extra slash here too) ── */}
          {showEllipsis && (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-mono px-1 py-0.5 text-light select-none">
                ...
              </span>
            </span>
          )}

          {/* ── 3. The Segments ── */}
          {visibleSegments.map((seg, i) => {
            const originalIndex =
              pathSegments.length - visibleSegments.length + i;
            const relativeSegPath =
              "/" + pathSegments.slice(0, originalIndex + 1).join("/");
            const absoluteSegPath = buildAbsolutePath(relativeSegPath);
            const isLast = originalIndex === pathSegments.length - 1;

            // ── Hide the separator if it's the very first item next to the root '/' ──
            const showSeparator = showEllipsis || i > 0;

            return (
              <span
                key={originalIndex}
                className="flex items-center gap-1 shrink-0 min-w-0"
              >
                {showSeparator && (
                  <span className="text-border text-[11px]">/</span>
                )}

                <button
                  onClick={() => !isLast && onNavigate(absoluteSegPath)}
                  title={seg}
                  className={`
                    text-[11px] font-mono px-1 py-0.5 rounded transition-colors truncate max-w-30
                    ${isLast ? "text-text cursor-default" : "text-dull hover:text-accent hover:bg-accent/8 cursor-pointer"}
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
          title="Refresh"
          className="p-1.5 rounded-lg text-dull border border-transparent hover:text-text hover:bg-panel hover:border-border disabled:opacity-30 transition-all"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <div className="w-px h-4 bg-border" />

        <button
          onClick={onShareClipboard}
          disabled={disabled}
          title="Share Clipboard"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-purple bg-purple/8 border border-purple/25 hover:bg-purple/15 hover:border-purple/40 disabled:opacity-40 transition-all"
        >
          <ClipboardPaste size={12} /> Share
        </button>

        {/* ── Search Trigger Button ── */}
        {!isSearchActive && (
          <button
            onClick={() => setIsSearchActive(true)}
            disabled={disabled}
            title="Search for files"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-gold bg-gold/8 border border-gold/25 hover:bg-gold/15 hover:border-gold/40 disabled:opacity-40 transition-all"
          >
            <Search size={12} /> Search
          </button>
        )}
      </div>
    </div>
  );
}
