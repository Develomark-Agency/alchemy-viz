import { defineServer, type HandlerContext, requireResource } from "../../../server/define.ts";
import type { D1Database } from "../bindings.ts";
import { localBinding } from "../runtime.ts";

function db(ctx: HandlerContext) {
  return localBinding<D1Database>(ctx, requireResource(ctx));
}

function quote(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

export interface TableInfo {
  name: string,
  type: "table" | "view",
  rows: number | null,
  /** Bookkeeping tables (migrations), listed after user tables. */
  internal: boolean
}

export interface ColumnInfo {
  name: string,
  type: string,
  pk: boolean,
  notnull: boolean
}

async function listTables(d: D1Database) {
  const { results } = await d
    .prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    )
    .all<{ name: string, type: "table" | "view" }>();
  return results;
}

export default defineServer({
  tables: async (_: undefined, ctx): Promise<TableInfo[]> => {
    const d = await db(ctx);
    const tables = await listTables(d);
    const withCounts = await Promise.all(
      tables.map(async t => {
        const row = await d
          .prepare(`SELECT COUNT(*) AS n FROM ${quote(t.name)}`)
          .first<{ n: number }>()
          .catch(() => null);
        return { ...t, rows: row?.n ?? null, internal: t.name.startsWith("__") || t.name.startsWith("d1_") };
      })
    );
    return withCounts.sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));
  },

  rows: async (input: { table: string, limit?: number, offset?: number }, ctx) => {
    const d = await db(ctx);
    // Only ever interpolate a name that exists, so the table name can't inject SQL.
    const tables = await listTables(d);
    if(!tables.some(t => t.name === input.table)) throw new Error(`No table '${input.table}'.`);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
    const offset = Math.max(input.offset ?? 0, 0);
    const [{ results: columns }, { results: rows }, total] = await Promise.all([
      d.prepare(`PRAGMA table_info(${quote(input.table)})`).all<{ name: string, type: string, pk: number, notnull: number }>(),
      d.prepare(`SELECT * FROM ${quote(input.table)} LIMIT ? OFFSET ?`).bind(limit, offset).all(),
      d.prepare(`SELECT COUNT(*) AS n FROM ${quote(input.table)}`).first<{ n: number }>()
    ]);
    return {
      columns: columns.map((c): ColumnInfo => ({ name: c.name, type: c.type, pk: c.pk > 0, notnull: c.notnull === 1 })),
      rows,
      total: total?.n ?? rows.length,
      limit,
      offset
    };
  },

  query: async (input: { sql: string }, ctx) => {
    const sql = input.sql.trim();
    if(!sql) throw new Error("Enter a SQL statement.");
    const d = await db(ctx);
    const started = performance.now();
    const result = await d.prepare(sql).all();
    return {
      rows: result.results ?? [],
      meta: {
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        rowsRead: result.meta?.rows_read,
        rowsWritten: result.meta?.rows_written,
        changes: result.meta?.changes,
        lastRowId: result.meta?.last_row_id
      }
    };
  }
});
