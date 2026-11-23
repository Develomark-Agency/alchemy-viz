import { Play, RefreshCw, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Badge,
  Button,
  CodeEditor,
  type Column,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatCell,
  IconButton,
  inferColumns,
  Kbd,
  Loading,
  Panel,
  Split,
  TabCount,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab
} from "../../../ui/index.ts";
import type server from "./server.ts";

type D1Api = Api<typeof server>;
type Row = Record<string, unknown>;

export default defineView<typeof server>(({ api, resource }) => {
  const [tab = "tables", setTab] = useUrlState("view");
  const [table, setTable] = useUrlState("table");
  const tables = api.tables.useQuery();
  // The SQL text survives switching tabs.
  const [sql, setSql] = useState("");

  useEffect(() => {
    if(!table && tables.data?.length) setTable(tables.data[0]!.name);
  }, [tables.data, table, setTable]);

  return (
    <Tabs value={tab} onValueChange={next => next && setTab(next === "tables" ? undefined : next)}>
      <TabsList aria-label="Database view" className="border-b-0">
        <TabsTab value="tables">
          Tables
          <TabCount>{tables.data?.filter(t => !t.internal).length}</TabCount>
        </TabsTab>
        <TabsTab value="sql">SQL console</TabsTab>
      </TabsList>
      <TabsPanel value="tables">
        <Split
          leftWidth={240}
          left={(
            <Panel title="Tables" flush>
              {tables.error
                ? <ErrorBanner error={tables.error} className="m-3" />
                : !tables.data
                  ? <Loading />
                  : tables.data.length === 0
                    ? <EmptyState title="No tables yet">Add a migration or create one in the SQL console.</EmptyState>
                    : (
                      <div className="flex flex-col p-1">
                        {tables.data.map(t => (
                          <button
                            key={t.name}
                            type="button"
                            aria-pressed={table === t.name}
                            onClick={() => setTable(t.name)}
                            className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent-soft-fg"
                          >
                            <Table2 className="size-3.5 shrink-0 opacity-60" />
                            <span className={t.internal ? "truncate text-fg-subtle" : "truncate"}>{t.name}</span>
                            {t.type === "view" && <Badge>view</Badge>}
                            <span className="ml-auto text-xs text-fg-subtle tabular-nums">{t.rows ?? "?"}</span>
                          </button>
                        ))}
                      </div>
                    )}
            </Panel>
          )}
          right={table
            ? <TableBrowser key={table} table={table} api={api} />
            : <Panel><EmptyState title="Select a table" /></Panel>}
        />
      </TabsPanel>
      <TabsPanel value="sql">
        <SqlConsole api={api} sql={sql} setSql={setSql} defaultTable={table} databaseName={String(resource.attr.databaseName ?? resource.logicalId)} />
      </TabsPanel>
    </Tabs>
  );
});

function TableBrowser({ table, api }: { table: string, api: D1Api }) {
  const pages = api.rows.useInfiniteQuery({ table }, { getNextCursor: p => p.cursor });
  const first = pages.data?.pages[0];
  const rows = useMemo(() => pages.data?.pages.flatMap(p => p.rows), [pages.data]);
  const columns = useMemo<Array<Column<Row>>>(
    () => (first?.columns ?? []).map(c => ({
      id: c.name,
      size: Math.min(Math.max(c.name.length * 9 + 48, 100), 280),
      header: (
        <span className="inline-flex items-baseline gap-1.5" title={c.type || undefined}>
          {c.name}
          {c.pk && <span className="text-[10px] font-semibold text-accent">PK</span>}
          {c.type && <span className="text-[10px] font-normal text-fg-subtle uppercase">{c.type}</span>}
        </span>
      ),
      cell: (row: Row) => formatCell(row[c.name])
    })),
    [first]
  );

  return (
    <Panel
      title={<span className="font-mono text-xs">{table}</span>}
      actions={<IconButton label="Refresh" onClick={() => pages.refetch()}><RefreshCw /></IconButton>}
      flush
    >
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
        footer={first && `${rows?.length ?? 0} of ${first.total} rows`}
        maxHeight={600}
      />
    </Panel>
  );
}

function SqlConsole({ api, sql, setSql, defaultTable, databaseName }: { api: D1Api, sql: string, setSql: (s: string) => void, defaultTable?: string, databaseName: string }) {
  const schema = api.schema.useQuery();
  const query = api.query.useMutation();
  const text = sql || (defaultTable ? `SELECT * FROM "${defaultTable}" LIMIT 100;` : "SELECT 1;");
  const rows = query.data?.rows as Row[] | undefined;
  const columns = useMemo(() => inferColumns(rows ?? []), [rows]);

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
              {query.data.meta.durationMs} ms · {query.data.meta.rowsRead} read · {query.data.meta.rowsWritten} written
            </span>
          )}
          flush
        >
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(_, i) => String(i)}
            empty={query.data.meta.changes ? `Statement ran: ${query.data.meta.changes} row(s) changed.` : "Statement ran. No rows returned."}
            maxHeight={520}
          />
        </Panel>
      )}
    </div>
  );
}
