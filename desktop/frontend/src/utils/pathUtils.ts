/** Returns the last segment of a path (basename). */
export function getBaseDirName(path: string): string {
  if (!path) return "/";
  const normPath = path.replace(/[/\\]+/g, "/");
  if (normPath === "/" || normPath === "") return "/";
  const segments = normPath.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : "/";
}
