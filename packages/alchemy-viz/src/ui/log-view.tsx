import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "./cn.ts";
import { EmptyState } from "./feedback.tsx";

export interface LogEntry {
  time: number,
  message: string,
  level?: string,
  stream?: string,
  /** Shown as a tag before the message, e.g. the resource that logged it. */
  source?: string
}

/**
 * A virtualized log tail. With `follow`, it keeps the newest line in view
 * until the reader scrolls up.
 */
export function LogView({ lines, follow = true, empty = "No logs yet", maxHeight = 560, className }: { lines: LogEntry[] | undefined, follow?: boolean, empty?: ReactNode, maxHeight?: number, className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const count = lines?.length ?? 0;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20
  });

  useEffect(() => {
    if(follow && atBottom.current && count > 0) virtualizer.scrollToIndex(count - 1, { align: "end" });
  }, [count, follow, virtualizer]);

  if(!lines || lines.length === 0) return <EmptyState title={empty} />;

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-auto py-2 font-mono text-xs leading-5", className)}
      style={{ maxHeight }}
      onScroll={e => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => {
          const line = lines[item.index]!;
          const bad = line.level === "error" || line.stream === "stderr";
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 grid grid-cols-[84px_minmax(0,1fr)] gap-3 px-4 hover:bg-hover"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <span className="text-fg-subtle tabular-nums">{new Date(line.time).toLocaleTimeString()}</span>
              <span className={cn("break-words whitespace-pre-wrap", bad && "text-danger", line.level === "warn" && "text-warn")}>
                {line.source && <span className="mr-2 text-fg-subtle">[{line.source}]</span>}
                {line.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
