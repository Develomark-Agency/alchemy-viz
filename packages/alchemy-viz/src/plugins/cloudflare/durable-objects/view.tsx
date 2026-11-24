import { Database, KeyRound, Play, RefreshCw, SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Badge,
  Button,
  cn,
  CodeEditor,
  type Column,
  CopyButton,
  DataTable,
  EmptyState,
  ErrorBanner,
  fitColumnWidth,
  formatBytes,
  formatCell,
  formatRelative,
  IconButton,
  inferColumns,
  JsonInspector,
  Loading,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  Split
} from "../../../ui/index.ts";
import type { KvEntry } from "../do-storage.ts";
import type server from "./server.ts";

type DoApi = Api<typeof server>;
type Row = Record<string, unknown>;
type ObjectSummary = { id: string, size: number, modified: string };

const objectColumns: Array<Column<ObjectSummary>> = [
  { id: "id", header: "Object id", size: 170, cell: o => <span className="font-mono text-xs" title={o.id}>{o.id.slice(0, 16)}…</span> },
  { id: "size", header: "Size", size: 80, align: "right", accessor: o => o.size, cell: o => <span className="text-xs tabular-nums text-fg-muted">{formatBytes(o.size)}</span> },
  { id: "modified", header: "Written", size: 90, align: "right", accessor: o => o.modified, cell: o => <span className="text-xs text-fg-muted" title={new Date(o.modified).toLocaleString()}>{formatRelative(o.modified)}</span> }
];

export default defineView<typeof server>(({ api }) => {
  const namespaces = api.namespaces.useQuery(undefined, { refetchInterval: 5000 });
  const [className, setClassName] = useUrlState("doClass");
  const [objectId, setObjectId] = useUrlState("doObject");
  const active = className ?? namespaces.data?.[0]?.className;
  const objects = api.objects.useQuery({ className: active ?? "" }, { enabled: !!active, refetchInterval: 5000 });

  if(namespaces.error) return <ErrorBanner error={namespaces.error} />;
  if(!namespaces.data) return <Loading />;
  if(namespaces.data.length === 0) {
    return (
      <Panel>
        <EmptyState title="No Durable Objects">This Worker doesn't host any Durable Object classes.</EmptyState>
      </Panel>
    );
  }

  return (
    <Split
      leftWidth={380}
      sticky="left"
      left={(
        <Panel
          title={(
            <>
              Objects
              {objects.data && <span className="font-normal text-fg-subtle tabular-nums">{objects.data.length}</span>}
            </>
          )}
          actions={namespaces.data.length > 1 && (
            <Select
              aria-label="Durable Object class"
              value={active ?? null}
              onValueChange={next => {
                setClassName(next);
                setObjectId(undefined);
              }}
              options={namespaces.data.map(n => ({ value: n.className, label: `${n.className} (${n.objects})`, text: n.className }))}
            />
          )}
          flush
        >
          {namespaces.data.length === 1 && (
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted">
              <span className="font-mono text-fg">{active}</span>
              <span className="ml-auto tabular-nums">{formatBytes(namespaces.data[0]!.size)}</span>
            </div>
          )}
          <DataTable
            rows={objects.data}
            columns={objectColumns}
            getRowId={o => o.id}
            loading={objects.isPending}
            error={objects.error}
            selectedId={objectId}
            onRowClick={o => setObjectId(o.id)}
            empty="No object of this class has stored anything yet."
          />
          <p className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
            Objects are listed by id. An object that never wrote to storage has nothing on disk and isn't shown.
          </p>
        </Panel>
      )}
      right={active && objectId
        ? <ObjectDetail key={objectId} api={api} className={active} id={objectId} />
        : (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState title="Select an object">Pick an object to see what it has stored.</EmptyState>
          </div>
        )}
    />
  );
});

type Section = "kv" | "sql" | "query";

function ObjectDetail({ api, className, id }: { api: DoApi, className: string, id: string }) {
  const summary = api.object.useQuery({ className, id }, { refetchInterval: 5000 });
  const [section, setSection] = useState<Section>("kv");
  const tables = summary.data?.tables ?? [];

  // Open where the data is: SQL when the object uses only the SQL API.
  useEffect(() => {
    if(summary.data && summary.data.keys === 0 && summary.data.tables.length > 0) setSection("sql");
  }, [summary.data?.keys === 0 && tables.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={(
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-fg-muted">{className}</span>
            <span className="truncate font-mono text-xs" title={id}>{id}</span>
            <CopyButton text={id} label="Copy object id" />
          </span>
        )}
        actions={(
          <SegmentedControl<Section>
            aria-label="Storage"
            value={section}
            onValueChange={setSection}
            options={[
              { value: "kv", label: <><KeyRound />Key-value {summary.data && <Badge>{summary.data.keys}</Badge>}</> },
              { value: "sql", label: <><Database />SQL {summary.data && <Badge>{tables.length}</Badge>}</> },
              { value: "query", label: <><SquareTerminal />Query</> }
            ]}
          />
        )}
        flush
      >
        {summary.error && <ErrorBanner error={summary.error} className="m-4" />}
        {section === "kv" && <KvBrowser api={api} className={className} id={id} />}
        {section === "sql" && <SqlBrowser api={api} className={className} id={id} tables={tables} />}
        {section === "query" && <QueryConsole api={api} className={className} id={id} defaultTable={tables[0]?.name} />}
      </Panel>
    </div>
  );
}

function preview(entry: KvEntry) {
  if(entry.error) return <span className="text-danger">Couldn't decode</span>;
  const text = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
  return <span className="truncate font-mono text-xs text-fg-muted">{text}</span>;
}

const kvColumns: Array<Column<KvEntry>> = [
  { id: "key", header: "Key", size: 200, cell: e => <span className="font-mono text-xs">{e.key}</span> },
  { id: "value", header: "Value", size: 240, sortable: false, cell: preview },
  { id: "bytes", header: "Size", size: 70, align: "right", accessor: e => e.bytes, cell: e => <span className="text-xs tabular-nums text-fg-subtle">{formatBytes(e.bytes)}</span> }
];

function KvBrowser({ api, className, id }: { api: DoApi, className: string, id: string }) {
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<string>();
  const pages = api.kv.useInfiniteQuery({ className, id, prefix }, { getNextCursor: p => p.cursor });
  const entries = useMemo(() => pages.data?.pages.flatMap(p => p.entries), [pages.data]);
  const entry = entries?.find(e => e.key === selected);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line p-2">
        <SearchInput aria-label="Filter keys by prefix" placeholder="Filter by prefix" value={prefix} onValueChange={setPrefix} />
        <IconButton label="Refresh" onClick={() => pages.refetch()}>
          <RefreshCw className={cn(pages.isRefetching && "animate-spin")} />
        </IconButton>
      </div>
      <DataTable
        rows={entries}
        columns={kvColumns}
        getRowId={e => e.key}
        loading={pages.isPending}
        error={pages.error}
        selectedId={selected}
        onRowClick={e => setSelected(e.key === selected ? undefined : e.key)}
        empty={prefix ? "No keys with this prefix" : "Nothing stored with the key-value API"}
        hasMore={pages.hasNextPage}
        loadingMore={pages.isFetchingNextPage}
        onEndReached={() => pages.fetchNextPage()}
        footer={pages.data && `${entries?.length ?? 0} of ${pages.data.pages[0]?.total ?? 0} keys`}
      />
      {entry && (
        <div className="border-t border-line p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs">{entry.key}</span>
            <span className="text-xs text-fg-subtle">{formatBytes(entry.bytes)}</span>
          </div>
          {entry.error
            ? <ErrorBanner error={`This value couldn't be decoded: ${entry.error}`} />
            : <JsonInspector value={entry.value} label={entry.key} openDepth={3} />}
        </div>
      )}
    </>
  );
}

function rowColumns(columns: Array<{ name: string, type: string, pk: number }>, sample: Row[]): Array<Column<Row>> {
  return columns.map(c => ({
    id: c.name,
    size: fitColumnWidth(sample, c.name, c.name.length + c.type.length + 2),
    emphasis: c.pk > 0,
    header: (
      <span className="inline-flex items-center gap-1.5">
        {c.pk > 0 && <KeyRound className="size-3 shrink-0" />}
        {c.name}
        {c.type && <span className="font-mono text-[10px] font-normal text-fg-subtle lowercase">{c.type}</span>}
      </span>
    ),
    cell: (row: Row) => formatCell(row[c.name])
  }));
}

function SqlBrowser({ api, className, id, tables }: { api: DoApi, className: string, id: string, tables: Array<{ name: string, rows: number }> }) {
  const [table, setTable] = useState(tables[0]?.name);
  const current = table && tables.some(t => t.name === table) ? table : tables[0]?.name;
  const pages = api.rows.useInfiniteQuery({ className, id, table: current ?? "" }, { getNextCursor: p => p.cursor, enabled: !!current });
  const first = pages.data?.pages[0];
  const rows = useMemo(() => pages.data?.pages.flatMap(p => p.rows), [pages.data]);
  const columns = useMemo(() => rowColumns(first?.columns ?? [], first?.rows ?? []), [first]);

  if(tables.length === 0) {
    return <EmptyState title="No SQL tables">This object hasn't created any tables with <code className="font-mono text-xs">ctx.storage.sql</code>.</EmptyState>;
  }
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line p-2">
        <Select
          aria-label="Table"
          value={current ?? null}
          onValueChange={setTable}
          options={tables.map(t => ({ value: t.name, label: `${t.name} (${t.rows.toLocaleString()})`, text: t.name }))}
        />
        <IconButton label="Refresh" onClick={() => pages.refetch()} className="ml-auto">
          <RefreshCw className={cn(pages.isRefetching && !pages.isFetchingNextPage && "animate-spin")} />
        </IconButton>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(_, i) => String(i)}
        loading={pages.isPending}
        error={pages.error}
        empty="This table is empty"
        hasMore={pages.hasNextPage}
        loadingMore={pages.isFetchingNextPage}
        onEndReached={() => pages.fetchNextPage()}
        footer={first && `${(rows?.length ?? 0).toLocaleString()} of ${first.total.toLocaleString()} rows`}
      />
    </>
  );
}

function QueryConsole({ api, className, id, defaultTable }: { api: DoApi, className: string, id: string, defaultTable?: string }) {
  const [sql, setSql] = useState(defaultTable ? `SELECT * FROM "${defaultTable}" LIMIT 100;` : "SELECT name FROM sqlite_master WHERE type = 'table';");
  const query = api.query.useMutation();
  const rows = query.data?.rows as Row[] | undefined;
  const columns = useMemo(() => inferColumns(rows ?? []), [rows]);
  function run() {
    query.mutate({ className, id, sql });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 p-4">
        <CodeEditor aria-label="SQL" value={sql} onChange={setSql} onSubmit={run} language="sql" minHeight={100} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-subtle">Read-only: the object owns its storage, so writes are refused here.</span>
          <Button size="sm" variant="primary" onClick={run}>
            <Play />
            Run
          </Button>
        </div>
        <ErrorBanner error={query.error} />
      </div>
      {query.data && (
        <div className="border-t border-line">
          <DataTable rows={rows} columns={columns} getRowId={(_, i) => String(i)} empty="No rows returned." footer={`${rows?.length ?? 0} rows · ${query.data.durationMs} ms`} />
        </div>
      )}
    </div>
  );
}
