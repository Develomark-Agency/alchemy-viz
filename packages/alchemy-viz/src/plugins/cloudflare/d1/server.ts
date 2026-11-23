import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
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
    .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string, type: "table" | "view" }>();
  return results;
}

async function columnsOf(d: D1Database, table: string): Promise<ColumnInfo[]> {
  const { results } = await d.prepare(`PRAGMA table_info(${quote(table)})`).all<{ name: string, type: string, pk: number, notnull: number }>();
  return results.map(c => ({ name: c.name, type: c.type, pk: c.pk > 0, notnull: c.notnull === 1 }));
}

const PAGE = 100;

export default defineServer({
  tables: async (_: undefined, ctx): Promise<TableInfo[]> => {
    const d = await db(ctx);
    const tables = await Promise.all((await listTables(d)).map(async t => {
      const row = await d.prepare(`SELECT COUNT(*) AS n FROM ${quote(t.name)}`).first<{ n: number }>().catch(() => null);
      return { ...t, rows: row?.n ?? null, internal: t.name.startsWith("__") || t.name.startsWith("d1_") };
    }));
    return tables.sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));
  },

  /** Every table and its columns, for SQL autocomplete. */
  schema: async (_: undefined, ctx): Promise<Record<string, string[]>> => {
    const d = await db(ctx);
    const tables = await listTables(d);
    const entries = await Promise.all(tables.map(async t => [t.name, (await columnsOf(d, t.name)).map(c => c.name)] as const));
    return Object.fromEntries(entries);
  },

  /** A page of rows. The cursor is the offset of the next page. */
  rows: handler(z.object({ table: z.string().min(1), cursor: z.string().regex(/^\d+$/).optional() }), async (input, ctx) => {
    const d = await db(ctx);
    // Only interpolate a name that exists, so the table name can't inject SQL.
    if(!(await listTables(d)).some(t => t.name === input.table)) throw new Error(`No table '${input.table}'.`);
    const offset = Number(input.cursor ?? 0);
    const [columns, { results: rows }, total] = await Promise.all([
      columnsOf(d, input.table),
      d.prepare(`SELECT * FROM ${quote(input.table)} LIMIT ? OFFSET ?`).bind(PAGE, offset).all(),
      d.prepare(`SELECT COUNT(*) AS n FROM ${quote(input.table)}`).first<{ n: number }>()
    ]);
    const count = total?.n ?? rows.length;
    return {
      columns,
      rows,
      total: count,
      cursor: offset + rows.length < count ? String(offset + rows.length) : undefined
    };
  }),

  query: handler(z.object({ sql: z.string().trim().min(1, "Enter a SQL statement") }), async (input, ctx) => {
    const d = await db(ctx);
    const started = performance.now();
    const result = await d.prepare(input.sql).all();
    return {
      rows: result.results ?? [],
      meta: {
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        rowsRead: result.meta?.rows_read ?? 0,
        rowsWritten: result.meta?.rows_written ?? 0,
        changes: result.meta?.changes ?? 0
      }
    };
  })
});
