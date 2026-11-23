import { useEffect, useState } from "react";
import { type Api, defineView } from "../../../client/index.tsx";
import {
  Badge,
  Button,
  CodeEditor,
  type Column,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatCell,
  inferColumns,
  Loading,
  Panel,
  Row,
  Split,
  Stack,
  Tabs
} from "../../../ui/index.ts";
import type server from "./server.ts";

type D1Api = Api<typeof server>;
type Row = Record<string, unknown>;

const PAGE = 50;

export default defineView<typeof server>(({ api, resource }) => {
  const [tab, setTab] = useState<"tables" | "sql">("tables");
  const tables = api.tables.useQuery();
  const [table, setTable] = useState<string>();
  // SQL text survives tab switches.
  const [sql, setSql] = useState("");

  useEffect(() => {
    if(!table && tables.data?.length) setTable(tables.data[0]!.name);
  }, [tables.data, table]);

  return (
    <Stack gap={12}>
      <Tabs
        items={[
          { key: "tables", label: "Tables", count: tables.data?.filter(t => !t.internal).length },
          { key: "sql", label: "SQL console" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "tables" ? (
        <Split
          leftWidth={240}
          left={
            <Panel title="Tables" flush>
              {tables.error ? (
                <div style={{ padding: 10 }}>
                  <ErrorBanner error={tables.error} />
                </div>
              ) : !tables.data ? (
                <Loading />
              ) : tables.data.length === 0 ? (
                <EmptyState title="No tables yet">Add a migration or create one in the SQL console.</EmptyState>
              ) : (
                <div className="av-list">
                  {tables.data.map(t => (
                    <button
                      key={t.name}
                      type="button"
                      className="av-list-item"
                      aria-selected={table === t.name}
                      onClick={() => setTable(t.name)}
                    >
                      <span className={`av-truncate av-grow${t.internal ? " av-muted" : ""}`}>{t.name}</span>
                      {t.type === "view" && <Badge>view</Badge>}
                      <span className="av-muted" style={{ fontSize: 12 }}>
                        {t.rows ?? "?"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          }
          right={
            table ? (
              <TableBrowser key={table} table={table} api={api} />
            ) : (
              <Panel>
                <EmptyState title="Select a table" />
              </Panel>
            )
          }
        />
      ) : (
        <SqlConsole api={api} sql={sql} setSql={setSql} defaultTable={table} databaseName={String(resource.attr.databaseName ?? resource.logicalId)} />
      )}
    </Stack>
  );
});

function TableBrowser({ table, api }: { table: string, api: D1Api }) {
  const [offset, setOffset] = useState(0);
  const page = api.rows.useQuery({ table, limit: PAGE, offset });
  const columns: Array<Column<Row>> =
    page.data?.columns.map(c => ({
      key: c.name,
      header: (
        <span title={c.type || undefined}>
          {c.name}
          {c.pk && <span className="av-muted"> · pk</span>}
        </span>
      ),
      render: (row: Row) => formatCell(row[c.name])
    })) ?? [];
  const total = page.data?.total ?? 0;
  return (
    <Panel
      title={<span className="av-mono">{table}</span>}
      actions={
        <Button size="sm" onClick={page.refetch} loading={page.loading}>
          Refresh
        </Button>
      }
      flush
    >
      <DataTable
        columns={columns}
        rows={page.data?.rows}
        rowKey={(_, i) => String(offset + i)}
        loading={page.loading}
        error={page.error}
        empty="This table is empty"
        maxHeight={560}
      />
      {page.data && total > 0 && (
        <div className="av-table-footer">
          <span>
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
          </span>
          <Row gap={6}>
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </Row>
        </div>
      )}
    </Panel>
  );
}

function SqlConsole({
  api,
  sql,
  setSql,
  defaultTable,
  databaseName
}: {
  api: D1Api,
  sql: string,
  setSql: (s: string) => void,
  defaultTable?: string,
  databaseName: string
}) {
  const query = api.query.useMutation();
  const text = sql || (defaultTable ? `SELECT * FROM "${defaultTable}" LIMIT 50;` : "SELECT 1;");
  function run() {
    return query.run({ sql: text }).catch(() => {});
  }
  const rows = query.data?.rows as Row[] | undefined;
  return (
    <Stack gap={12}>
      <Panel
        title={<span>Query <span className="av-muted">{databaseName}</span></span>}
        actions={
          <>
            <span className="av-muted" style={{ fontSize: 12 }}>
              ⌘↵ to run
            </span>
            <Button size="sm" variant="primary" onClick={run} loading={query.pending}>
              Run
            </Button>
          </>
        }
      >
        <CodeEditor value={text} onChange={setSql} onSubmit={run} rows={7} />
      </Panel>
      <ErrorBanner error={query.error} />
      {query.data && (
        <Panel
          title={`${rows?.length ?? 0} row${rows?.length === 1 ? "" : "s"}`}
          actions={
            <span className="av-muted" style={{ fontSize: 12 }}>
              {query.data.meta.durationMs} ms · {query.data.meta.rowsRead ?? 0} read · {query.data.meta.rowsWritten ?? 0} written
            </span>
          }
          flush
        >
          <DataTable
            columns={inferColumns(rows ?? [])}
            rows={rows}
            rowKey={(_, i) => String(i)}
            empty={
              query.data.meta.changes ? `Statement ran: ${query.data.meta.changes} row(s) changed.` : "Statement ran. No rows returned."
            }
            maxHeight={520}
          />
        </Panel>
      )}
    </Stack>
  );
}
