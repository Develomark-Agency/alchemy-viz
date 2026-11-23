import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";

/** Replaces the home directory with `~`. */
export function shortenHome(path: string, home?: string) {
  if(home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}

/**
 * Shorter versions of a path, longest first. Whole segments after the first
 * are replaced by `…`, one at a time, so `/hello/world/this/is/really/long`
 * goes through `/hello/…/this/is/really/long` down to `/hello/…/long`.
 */
export function pathCandidates(path: string) {
  const parts = path.split("/");
  // An absolute path's first part is empty; keep the root's first folder with it.
  const head = parts[0] === "" ? 2 : 1;
  const out = [path];
  for(let tail = parts.length - head - 2; tail >= 1; tail--) {
    out.push([...parts.slice(0, head), "…", ...parts.slice(-tail)].join("/"));
  }
  return out;
}

/**
 * A file path that shortens by whole segments when space runs out, keeping
 * the first folder and as many trailing segments as fit. When even
 * `first/…/last` is too wide, the last segment itself ellipsizes. The full
 * path is in the tooltip.
 */
export function Path({ path, home, className }: { path: string, home?: string, className?: string }) {
  const shown = shortenHome(path, home);
  const ref = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(shown);

  useLayoutEffect(() => {
    const el = ref.current;
    const measure = probe.current;
    if(!el || !measure) return;
    const candidates = pathCandidates(shown);
    // Measured in the DOM rather than a canvas, so the width comes from
    // whichever fallback font the page actually rendered.
    function widthOf(text: string) {
      measure!.textContent = text;
      return measure!.getBoundingClientRect().width;
    }
    function fit() {
      // Sub-pixel slack so a path that exactly fits isn't shortened.
      const width = el!.getBoundingClientRect().width + 0.5;
      setText(candidates.find(c => widthOf(c) <= width) ?? candidates.at(-1)!);
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    // The invisible copy gives the box the full path's width, so it shrinks
    // with its container and grows back when space returns.
    <span ref={ref} title={path} className={cn("relative inline-block max-w-full min-w-0 overflow-hidden align-bottom font-mono text-xs", className)}>
      <span aria-hidden className="invisible block h-0 whitespace-nowrap">{shown}</span>
      <span ref={probe} aria-hidden className="invisible absolute top-0 left-0 whitespace-nowrap" />
      <span className="block truncate">{text}</span>
    </span>
  );
}
