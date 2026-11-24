import { ArrowDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "cn";

// The panel is dark in both themes, like a terminal window; only the chrome around it follows the page.
const LEVELS: Record<string, string> = {
  INFO: "text-[#7cacf8]",
  WARN: "text-[#fbbf24]",
  WARNING: "text-[#fbbf24]",
  ERROR: "text-[#f87171]",
  DEBUG: "text-[#7a7a7a]"
};

// A bracketed tag keeps the same colour from line to line, so one resource's output can be followed by eye.
const TAGS = ["text-[#4fbf84]", "text-[#d08fd6]", "text-[#4cc9d8]", "text-[#f08a3c]", "text-[#a58bff]", "text-[#8fa8c6]"];

function tagColor(tag: string) {
  let hash = 0;
  for(const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAGS[hash % TAGS.length]!;
}

const LOG_LINE = /^\[(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\]\s+([A-Z]+):?\s?(.*)$/;
const URL = /(https?:\/\/[^\s'"<>]+)/g;

/** Underlines URLs and lets the rest through as text. */
function withLinks(text: string): ReactNode[] {
  return text.split(URL).map((part, i) => (i % 2 ? <span key={i} className="text-[#7cacf8] underline decoration-[#7cacf8]/40 underline-offset-2">{part}</span> : part));
}

function Line({ text }: { text: string }) {
  const match = LOG_LINE.exec(text);
  if(!match) return <div className="min-h-5 break-words whitespace-pre-wrap text-[#c9c9c9]">{withLinks(text)}</div>;
  const [, time, level = "", rest = ""] = match;
  const tag = /^\[([^\]]+)\]\s?(.*)$/.exec(rest);
  return (
    <div className="min-h-5 break-words whitespace-pre-wrap text-[#c9c9c9]">
      <span className="text-[#6b6b6b]">{time}</span>
      {" "}
      <span className={cn("font-medium", LEVELS[level] ?? "text-[#a1a1a1]")}>{level.padEnd(5)}</span>
      {" "}
      {tag ? <span className={tagColor(tag[1]!)}>[{tag[1]}]</span> : null}
      {tag ? " " : null}
      <span className={level === "ERROR" ? "text-[#fca5a5]" : level === "WARN" || level === "WARNING" ? "text-[#fde68a]" : undefined}>{withLinks(tag ? tag[2]! : rest)}</span>
    </div>
  );
}

/**
 * Plain-text process output in a terminal-style panel: a title bar with a
 * live indicator, coloured log levels and tags, and a tail that follows new
 * lines until the reader scrolls up.
 */
export function TerminalOutput({ title, lines, live = false, empty = "No output.", className, maxHeight = "55vh" }: {
  /** What the panel shows, e.g. the command line. */
  title: ReactNode,
  lines: string[],
  /** Shows a pulsing dot while the process is still running. */
  live?: boolean,
  empty?: ReactNode,
  className?: string,
  maxHeight?: string
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if(el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  function jump() {
    const el = scroller.current;
    if(!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-white/10 bg-[#0c0c0c] shadow-xs", className)}>
      <div className="flex h-9 items-center gap-2.5 border-b border-white/8 bg-white/3 px-3.5 text-xs text-[#8a8a8a]">
        <span className="font-mono text-[#6b6b6b] select-none">$</span>
        <span className="min-w-0 flex-1 truncate font-mono">{title}</span>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#4fbf84] motion-reduce:animate-none" />
            Live
          </span>
        )}
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        role="log"
        aria-label="Output"
        className="overflow-auto px-3.5 py-3 font-mono text-xs leading-5 selection:bg-white/20 focus-visible:outline-none"
        style={{ maxHeight, minHeight: 160 }}
        onScroll={event => {
          const el = event.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          pinned.current = atBottom;
          setAway(!atBottom);
        }}
      >
        {lines.length === 0
          ? <div className="text-[#6b6b6b]">{empty}</div>
          : lines.map((line, i) => <Line key={i} text={line} />)}
        {live && lines.length > 0 && <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-[#c9c9c9]/70 motion-reduce:animate-none" aria-hidden />}
      </div>
      {away && (
        <button
          type="button"
          onClick={jump}
          className="absolute right-3 bottom-3 flex h-7 items-center gap-1.5 rounded-md border border-white/15 bg-[#1c1c1c] px-2.5 text-xs text-[#c9c9c9] shadow-popup transition-colors hover:bg-[#262626]"
        >
          <ArrowDown className="size-3" />
          Latest
        </button>
      )}
    </div>
  );
}
