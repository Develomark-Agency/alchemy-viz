import { Eye, KeyRound, Play, RefreshCw, SquareTerminal, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Button,
  cn,
  CodeEditor,
  type Column,
  DataTable,
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
  EmptyState,
  ErrorBanner,
  fitColumnWidth,
  formatCell,
  IconButton,
  inferColumns,
  Kbd,
  Loading,
  Panel,
  PropertyList,
  Split,
  toProperties
} from "../../../ui/index.ts";
import type server from "./server.ts";

type D1Api = Api<typeof server>;
type Row = Record<string, unknown>;

/** A sidebar entry: the SQL console or one table. */
const navItem = "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] transition-colors duration-150 ease-out hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent-soft-fg [&_svg]:size-3.5 [&_svg]:shrink-0";

export default defineView<typeof server>(({ api, resource }) => {
  const [view, setView] = useUrlState("view");
  const [table, setTable] = useUrlState("table");
  const tables = api.tables.useQuery();
  // The SQL text survives switching to a table and back.
  const [sql, setSql] = useState("");
  const consoleOpen = view === "sql";

  useEffect(() => {
    if(!table && tables.data?.length) setTable(tables.data[0]!.name);
  }, [tables.data, table, setTable]);

  function openTable(name: string) {
    setTable(name);
    setView(undefined);
  }

  return (
    <Split
      leftWidth={240}
      sticky="left"
      left={(
        // One navigation for the whole database: the console, then every table.
        <nav aria-label="Database" className="flex max-h-[calc(100dvh-var(--topbar-h)-32px)] flex-col overflow-hidden rounded-lg border border-line bg-surface">
          {/* The console and the "Tables" label stay put; only the list below scrolls, inside the border. */}
          <div className="shrink-0 p-1 pb-0">
            <button type="button" aria-pressed={consoleOpen} onClick={() => setView("sql")} className={navItem}>
              <SquareTerminal className="opacity-70" />
              SQL console
            </button>
          </div>
          <div className="mx-2 my-1 h-px shrink-0 bg-line" />
          <div className="flex shrink-0 items-baseline justify-between px-3 pt-1 pb-1 text-[11px] font-medium text-fg-subtle">
            Tables
            {tables.data && <span className="font-normal tabular-nums">{tables.data.filter(t => !t.internal).length}</span>}
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-1 pt-0">
            {tables.error
              ? <ErrorBanner error={tables.error} className="m-1" />
              : !tables.data
                ? <Loading />
                : tables.data.length === 0
                  ? <p className="px-2 py-3 text-[13px] text-fg-subtle">No tables yet. Add a migration, or create one in the SQL console.</p>
                  : tables.data.map(t => (
                    <button key={t.name} type="button" aria-pressed={!consoleOpen && table === t.name} onClick={() => openTable(t.name)} className={navItem}>
                      {t.type === "view" ? <Eye className="opacity-60" /> : <Table2 className="opacity-60" />}
                      <span className={cn("truncate", t.internal && "text-fg-subtle")} title={t.type === "view" ? `${t.name} (view)` : t.name}>{t.name}</span>
                      <span className="ml-auto text-xs text-fg-subtle tabular-nums">{t.rows?.toLocaleString() ?? "?"}</span>
                    </button>
                  ))}
          </div>
        </nav>
      )}
      right={consoleOpen
        ? <SqlConsole api={api} sql={sql} setSql={setSql} defaultTable={table} databaseName={String(resource.attr.databaseName ?? resource.logicalId)} />
        : table
          ? <TableBrowser table={table} api={api} />
          : <div className="rounded-lg border border-dashed border-line"><EmptyState title="Select a table" /></div>}
    />
  );
});

const NUMERIC = /int|real|floa|doub|num|dec/i;

function TableBrowser({ table, api }: { table: string, api: D1Api }) {
  const pages = api.rows.useInfiniteQuery({ table }, { getNextCursor: p => p.cursor });
  const first = pages.data?.pages[0];
  const rows = useMemo(() => pages.data?.pages.flatMap(p => p.rows), [pages.data]);
  const [inspecting, setInspecting] = useState<Row>();
  const columns = useMemo<Array<Column<Row>>>(() => {
    const cols = first?.columns ?? [];
    const sample = first?.rows ?? [];
    const compound = cols.filter(c => c.pk > 0).length > 1;
    // Key columns first, in key order, then the rest as the table declares them.
    const ordered = [...cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk), ...cols.filter(c => c.pk === 0)];
    return ordered.map(c => ({
      id: c.name,
      size: fitColumnWidth(sample, c.name, c.name.length + c.type.length + 2),
      emphasis: c.pk > 0,
      align: NUMERIC.test(c.type) ? "right" : "left",
      header: (
        <span className="inline-flex items-center gap-1.5" title={[c.type, c.pk > 0 && (compound ? `primary key, part ${c.pk}` : "primary key")].filter(Boolean).join(", ") || undefined}>
          {c.pk > 0 && <KeyRound className="size-3 shrink-0" />}
          {c.name}
          {compound && c.pk > 0 && <span className="font-mono text-[10px] text-fg-subtle">{c.pk}</span>}
          {c.type && <span className="font-mono text-[10px] font-normal text-fg-subtle lowercase">{c.type}</span>}
        </span>
      ),
      cell: (row: Row) => formatCell(row[c.name])
    }));
  }, [first]);

  return (
    <Panel
      className={cn("transition-opacity duration-150 ease-out", pages.isPlaceholderData && "opacity-60")}
      title={(
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-xs">{table}</span>
          {first && <span className="text-xs font-normal text-fg-subtle tabular-nums">{first.total.toLocaleString()} rows</span>}
        </span>
      )}
      actions={(
        <IconButton label="Refresh" onClick={() => pages.refetch()}>
          <RefreshCw className={cn(pages.isRefetching && !pages.isFetchingNextPage && "animate-spin")} />
        </IconButton>
      )}
      flush
    >
      {/* The page scrolls, not the table: no second scrollbar, and the header sticks under the top bar. */}
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(_, i) => String(i)}
        onRowClick={setInspecting}
        loading={pages.isPending}
        error={pages.error}
        empty="This table is empty"
        hasMore={pages.hasNextPage}
        loadingMore={pages.isFetchingNextPage}
        onEndReached={() => pages.fetchNextPage()}
        footer={first && `${(rows?.length ?? 0).toLocaleString()} of ${first.total.toLocaleString()} loaded`}
        scroll="page"
      />
      <RowDialog row={inspecting} table={table} keys={first?.columns.filter(c => c.pk > 0).map(c => c.name) ?? []} onClose={() => setInspecting(undefined)} />
    </Panel>
  );
}

/** Every value of one row, with JSON columns expanded, in a property sheet. */
function RowDialog({ row, table, keys, onClose }: { row: Row | undefined, table: string, keys: string[], onClose: () => void }) {
  // Keep the last row while the dialog animates closed.
  const [shown, setShown] = useState(row);
  useEffect(() => {
    if(row) setShown(row);
  }, [row]);
  const id = shown && keys.length > 0 ? keys.map(k => String(shown[k])).join(", ") : undefined;
  return (
    <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[min(520px,calc(100vw-32px))]">
        <DialogTitle>
          <span className="font-mono text-[13px]">{table}</span>
          {id && <span className="ml-2 font-normal text-fg-subtle">{id}</span>}
        </DialogTitle>
        <DialogBody className="px-0 pt-2 pb-2">
          {shown && <PropertyList items={toProperties(shown)} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SqlConsole({ api, sql, setSql, defaultTable, databaseName }: { api: D1Api, sql: string, setSql: (s: string) => void, defaultTable?: string, databaseName: string }) {
  const schema = api.schema.useQuery();
  const query = api.query.useMutation();
  const text = sql || (defaultTable ? `SELECT * FROM "${defaultTable}" LIMIT 100;` : "SELECT 1;");
  const rows = query.data?.rows as Row[] | undefined;
  const columns = useMemo(() => inferColumns(rows ?? []), [rows]);
  const [inspecting, setInspecting] = useState<Row>();

  function run() {
    query.mutate({ sql: text });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={<span>Query <span className="font-normal text-fg-subtle">{databaseName}</span></span>}
        actions={(
          <>
            <span className="hidden items-center gap-1 text-xs text-fg-subtle sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button size="sm" variant="primary" onClick={run}>
              <Play />
              Run
            </Button>
          </>
        )}
      >
        <CodeEditor aria-label="SQL" value={text} onChange={setSql} onSubmit={run} language="sql" schema={schema.data} minHeight={140} />
      </Panel>
      <ErrorBanner error={query.error} />
      {query.isPending && <Loading label="Running…" />}
      {query.data && !query.isPending && (
        <Panel
          title={`${rows?.length ?? 0} row${rows?.length === 1 ? "" : "s"}`}
          actions={(
            <span className="text-xs text-fg-subtle tabular-nums">
              {query.data.meta.durationMs} ms, {query.data.meta.rowsRead} read, {query.data.meta.rowsWritten} written
            </span>
          )}
          flush
        >
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(_, i) => String(i)}
            onRowClick={setInspecting}
            empty={query.data.meta.changes ? `Statement ran: ${query.data.meta.changes} row(s) changed.` : "Statement ran. No rows returned."}
            scroll="page"
          />
          <RowDialog row={inspecting} table="Result row" keys={[]} onClose={() => setInspecting(undefined)} />
        </Panel>
      )}
    </div>
  );
}
