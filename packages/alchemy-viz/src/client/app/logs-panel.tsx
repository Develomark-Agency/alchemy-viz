import { useQuery } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorBanner, IconButton, type LogEntry, LogView, SearchInput, Switch } from "../../ui/index.ts";

interface Line {
  time: number,
  level: string,
  message: string,
  stream?: string,
  fqn?: string
}

/** Live tail of `.alchemy/log`, optionally scoped to one resource. */
export function LogsPanel({ fqn, showSource }: { fqn?: string, showSource?: boolean }) {
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState("");
  // "Clear" hides everything up to now; the server keeps returning it.
  const [clearedAt, setClearedAt] = useState(0);

  const logs = useQuery({
    queryKey: ["logs", fqn ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "2000" });
      if(fqn) params.set("fqn", fqn);
      const res = await fetch(`/__viz/api/logs?${params}`);
      const body = await res.json();
      if(!res.ok) throw new Error(body.error);
      return body.lines as Line[];
    },
    refetchInterval: follow ? 1_500 : false
  });

  const shown = useMemo<LogEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    return (logs.data ?? [])
      .filter(l => l.time > clearedAt)
      .filter(l => !q || l.message.toLowerCase().includes(q) || l.fqn?.toLowerCase().includes(q))
      .map(l => ({ ...l, source: showSource ? l.fqn : undefined }));
  }, [logs.data, filter, clearedAt, showSource]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <SearchInput aria-label="Filter logs" placeholder="Filter" value={filter} onValueChange={setFilter} className="min-w-40 flex-1" />
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <Switch checked={follow} onCheckedChange={setFollow} />
          Live
        </label>
        <IconButton label="Clear view" onClick={() => setClearedAt(logs.data?.at(-1)?.time ?? Date.now())}>
          <Eraser />
        </IconButton>
      </div>
      <ErrorBanner error={logs.error} className="m-3" />
      <LogView
        lines={shown}
        follow={follow}
        empty={fqn ? "No logs from this resource yet. Logs come from the current alchemy dev run." : "No logs yet"}
      />
    </div>
  );
}
