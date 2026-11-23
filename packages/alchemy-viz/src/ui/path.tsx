import { cn } from "./cn.ts";

/** Replaces the home directory with `~`. */
export function shortenHome(path: string, home?: string) {
  if(home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}

/**
 * A file path that truncates in the middle: the start ellipsizes when space
 * runs out while the last `keep` segments always show, so
 * `~/Desktop/alchemy-viz/examples/basic` becomes `~/Desktop/al…/examples/basic`.
 * The full path is in the tooltip.
 */
export function Path({ path, home, keep = 2, className }: { path: string, home?: string, keep?: number, className?: string }) {
  const shown = shortenHome(path, home);
  const parts = shown.split("/");
  const cut = Math.max(parts.length - keep, 0);
  const head = parts.slice(0, cut).join("/");
  const tail = parts.slice(cut).join("/");
  return (
    <span title={path} className={cn("inline-flex min-w-0 font-mono text-xs", className)}>
      {head && <span className="min-w-0 truncate">{head}/</span>}
      <span className="shrink-0 whitespace-nowrap">{tail}</span>
    </span>
  );
}
