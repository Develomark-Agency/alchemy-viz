import { type ReactNode, useState } from "react";
import { Button } from "./controls.tsx";
import { EmptyState, ErrorBanner, Loading } from "./feedback.tsx";
import { formatTime } from "./format.ts";

// ---------- Badge / status ----------

export type Tone = "default" | "accent" | "ok" | "warn" | "danger" | "info";

export function Badge({ tone = "default", dot, children }: { tone?: Tone, dot?: boolean, children: ReactNode }) {
  return (
    <span className={`av-badge${tone === "default" ? "" : ` av-badge-${tone}`}`}>
      {dot && <span className="av-dot" />}
      {children}
    </span>
  );
}

function statusTone(status: string): Tone {
  if(/^(created|updated|ok|ready|running|active|complete)/i.test(status)) return "ok";
  if(/(ing)$|pending|queued/i.test(status)) return "warn";
  if(/fail|error|errored/i.test(status)) return "danger";
  return "default";
}

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {status}
    </Badge>
  );
}

// ---------- Key/value ----------

export function KeyValueList({ items }: { items: Array<[ReactNode, ReactNode]> | Record<string, ReactNode> }) {
  const entries = Array.isArray(items) ? items : Object.entries(items);
  return (
    <dl className="av-kv">
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v === undefined || v === null || v === "" ? <span className="av-null">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Code ----------

export function Code({ children }: { children: ReactNode }) {
  return <pre className="av-code">{children}</pre>;
}

/** Pretty-prints a string that parses as JSON; leaves other text alone. */
export function prettyText(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// ---------- JSON inspector ----------

function JsonValue({ value, depth, collapseAt }: { value: unknown, depth: number, collapseAt: number }) {
  const [open, setOpen] = useState(depth < collapseAt);
  if(value === null || value === undefined) return <span className="av-json-null">{String(value)}</span>;
  if(typeof value === "string") return <span className="av-json-string">{JSON.stringify(value)}</span>;
  if(typeof value === "number") return <span className="av-json-number">{value}</span>;
  if(typeof value === "boolean") return <span className="av-json-bool">{String(value)}</span>;
  const isArray = Array.isArray(value);
  const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as object);
  const [o, c] = isArray ? ["[", "]"] : ["{", "}"];
  if(entries.length === 0) return <span className="av-json-meta">{o + c}</span>;
  return (
    <>
      <button type="button" className="av-json-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "▾" : "▸"}
      </button>
      <span className="av-json-meta">{o}</span>
      {open ? (
        <>
          {entries.map(([k, v]) => (
            <div className="av-json-row" key={k}>
              {!isArray && <span className="av-json-key">{JSON.stringify(k)}: </span>}
              <JsonValue value={v} depth={depth + 1} collapseAt={collapseAt} />
            </div>
          ))}
          <span className="av-json-meta">{c}</span>
        </>
      ) : (
        <span className="av-json-meta">
          {" "}
          {entries.length} {isArray ? "items" : "keys"} {c}
        </span>
      )}
    </>
  );
}

export function JsonInspector({ value, collapseAt = 2 }: { value: unknown, collapseAt?: number }) {
  return (
    <div className="av-json" style={{ paddingLeft: 16 }}>
      <JsonValue value={value} depth={0} collapseAt={collapseAt} />
    </div>
  );
}

// ---------- Table ----------

export interface Column<Row> {
  key: string,
  header: ReactNode,
  /** Cell renderer. Defaults to `row[key]` formatted for display. */
  render?: (row: Row) => ReactNode,
  width?: number | string,
  align?: "left" | "right"
}

/** Formats an arbitrary cell value: null, objects as JSON, everything else as text. */
export function formatCell(value: unknown): ReactNode {
  if(value === null || value === undefined) return <span className="av-null">{String(value)}</span>;
  if(value instanceof Date) return formatTime(value);
  if(typeof value === "object") return <span className="av-mono">{JSON.stringify(value)}</span>;
  return String(value);
}

/** Columns inferred from the keys of the rows. */
export function inferColumns<Row extends Record<string, unknown>>(rows: Row[]): Array<Column<Row>> {
  const keys = new Set<string>();
  for(const r of rows.slice(0, 50)) for(const k of Object.keys(r)) keys.add(k);
  return [...keys].map(k => ({ key: k, header: k }));
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  loading,
  error,
  empty = "No rows",
  footer,
  onLoadMore,
  hasMore,
  maxHeight
}: {
  columns: Array<Column<Row>>,
  rows: Row[] | undefined,
  rowKey: (row: Row, index: number) => string,
  onRowClick?: (row: Row) => void,
  selectedKey?: string,
  loading?: boolean,
  error?: Error | string,
  empty?: ReactNode,
  /** Shown left of the load-more button, e.g. a row count. */
  footer?: ReactNode,
  /** Cursor pagination: called by the "Load more" button. */
  onLoadMore?: () => void,
  hasMore?: boolean,
  maxHeight?: number | string
}) {
  if(error) return <div style={{ padding: 12 }}><ErrorBanner error={error} /></div>;
  if(!rows && loading) return <Loading />;
  if(!rows || rows.length === 0) return typeof empty === "string" ? <EmptyState title={empty} /> : <>{empty}</>;
  return (
    <>
      <div className="av-table-wrap" style={{ maxHeight }}>
        <table className="av-table">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={{ width: c.width, textAlign: c.align }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = rowKey(row, i);
              return (
                <tr
                  key={key}
                  className={onRowClick ? "av-clickable" : undefined}
                  aria-selected={selectedKey === key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(c => (
                    <td key={c.key} style={{ textAlign: c.align }}>
                      {c.render ? c.render(row) : formatCell((row as Record<string, unknown>)[c.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(footer || hasMore) && (
        <div className="av-table-footer">
          <span>{footer}</span>
          {hasMore && onLoadMore && (
            <Button size="sm" onClick={onLoadMore} loading={loading}>
              Load more
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// ---------- Logs ----------

export interface LogEntry {
  time: number,
  message: string,
  level?: string,
  stream?: string
}

export function LogStream({ lines, empty = "No logs yet" }: { lines: LogEntry[] | undefined, empty?: ReactNode }) {
  if(!lines || lines.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="av-logs">
      {lines.map((l, i) => (
        <div className="av-log-line" key={`${l.time}-${i}`} data-level={l.level} data-stream={l.stream}>
          <span className="av-log-time">{new Date(l.time).toLocaleTimeString()}</span>
          <span className="av-log-msg">{l.message}</span>
        </div>
      ))}
    </div>
  );
}
