import { useEffect, useRef, useState } from "react";
import { Button, ErrorBanner, Input, LogStream, Row, Toggle } from "../../ui/index.ts";
import type { LogEntry } from "../../ui/index.ts";

interface Line extends LogEntry {
  fqn?: string
}

/** Live log tail from `.alchemy/log`, optionally scoped to one resource. */
export function LogsPanel({ fqn, showSource }: { fqn?: string, showSource?: boolean }) {
  const [lines, setLines] = useState<Line[]>();
  const [error, setError] = useState<Error>();
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState("");
  // "Clear view" hides lines up to now; polling keeps returning them.
  const [clearedAt, setClearedAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const params = new URLSearchParams({ limit: "1000" });
        if(fqn) params.set("fqn", fqn);
        const res = await fetch(`/__viz/api/logs?${params}`);
        const body = await res.json();
        if(!res.ok) throw new Error(body.error);
        if(!cancelled) {
          setLines(prev => (prev && prev.length === body.lines.length && prev.at(-1)?.time === body.lines.at(-1)?.time ? prev : body.lines));
          setError(undefined);
        }
      } catch (e) {
        if(!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
      if(!cancelled && follow) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fqn, follow]);

  useEffect(() => {
    const el = box.current?.querySelector(".av-logs");
    if(follow && el) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  const q = filter.trim().toLowerCase();
  const shown = (lines ?? [])
    .filter(l => l.time > clearedAt)
    .filter(l => !q || l.message.toLowerCase().includes(q) || l.fqn?.toLowerCase().includes(q))
    .map(l => (showSource && l.fqn ? { ...l, message: `[${l.fqn}] ${l.message}` } : l));

  return (
    <div ref={box}>
      <Row gap={12} style={{ padding: "10px 14px", borderBottom: "1px solid var(--av-border)" }}>
        <Input placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <Row gap={6}>
          <Toggle checked={follow} onChange={setFollow} label="Follow" />
          <span style={{ fontSize: 13 }}>Follow</span>
        </Row>
        <Button size="sm" onClick={() => setClearedAt(lines?.at(-1)?.time ?? Date.now())}>
          Clear view
        </Button>
      </Row>
      <ErrorBanner error={error} />
      <LogStream
        lines={shown}
        empty={fqn ? "No logs from this resource yet. Logs come from the current `alchemy dev` run." : "No logs yet"}
      />
    </div>
  );
}
