import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import type { ResourceInfo } from "../../../types.ts";
import type { ColumnInfo, TableInfo } from "../../cloudflare/d1/server.ts";
import { databaseToken, execute, isLocalUrl, orgOf, pipeline, platform, type SqlConnection } from "../platform.ts";

/**
 * A Turso database, over the SQL endpoint it serves (Hrana over HTTP).
 *
 * A cloud database gets a short-lived token minted with the project's
 * Platform API credentials. A database on a local libSQL server (a local
 * provider for `Turso.Database`, or any `http://127.0.0.1` URL) needs none.
 * Either way this answers in the D1 view's shapes, so the same table
 * browser and SQL console serve both.
 */

interface DatabaseAttr {
  name?: string,
  organization?: string,
  group?: string,
  hostname?: string,
  url?: string,
  httpUrl?: string,
  primaryRegion?: string,
  regions?: string[],
  blockReads?: boolean,
  blockWrites?: boolean,
  deleteProtection?: boolean,
  migrationsDir?: string,
  migrationsTable?: string,
  migrationsHashes?: Record<string, string>,
  importHashes?: Record<string, string>
}

function attrOf(r: ResourceInfo) {
  return (r.attr ?? {}) as DatabaseAttr;
}

/** The database's HTTP endpoint: `httpUrl`, or `url` with `libsql://` read as `https://`. */
function httpUrlOf(a: DatabaseAttr) {
  const url = a.httpUrl ?? a.url ?? (a.hostname ? `https://${a.hostname}` : undefined);
  if(!url) throw new Error("This database has no URL yet. It appears once the database is created.");
  return url.replace(/^libsql:\/\//, "https://");
}

export function isLocalDatabase(r: ResourceInfo) {
  if(r.mode) return r.mode === "local";
  const a = attrOf(r);
  const url = a.httpUrl ?? a.url;
  return typeof url === "string" && isLocalUrl(url);
}

async function connection(ctx: HandlerContext): Promise<SqlConnection> {
  const r = requireResource(ctx);
  const a = attrOf(r);
  const url = httpUrlOf(a);
  if(isLocalDatabase(r)) return { url };
  if(!a.name) throw new Error("This database has no name yet. It appears once the database is created.");
  return { url, token: await databaseToken(ctx, await orgOf(ctx, r), a.name) };
}

function quote(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

async function listTables(conn: SqlConnection) {
  const { rows } = await execute(conn, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%' ORDER BY name");
  return rows as Array<{ name: string, type: "table" | "view" }>;
}

async function columnsOf(conn: SqlConnection, table: string): Promise<ColumnInfo[]> {
  const { rows } = await execute(conn, `PRAGMA table_info(${quote(table)})`);
  return (rows as Array<{ name: string, type: string, pk: number, notnull: number }>).map(c => ({ name: c.name, type: c.type, pk: c.pk, notnull: c.notnull === 1 }));
}

const PAGE = 100;

function stackFqn(ctx: HandlerContext, type: string, match: (attr: Record<string, unknown>) => boolean) {
  return ctx.stack.resources.filter(r => r.type === type && match(r.attr ?? {})).map(r => r.fqn);
}

export default defineServer({
  /** Where the database is, whether it answers, and what it has used this billing period. */
  overview: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const a = attrOf(r);
    const local = isLocalDatabase(r);
    let error: string | undefined;
    let version: string | undefined;
    let latencyMs: number | undefined;
    try {
      // Minting the token is a separate request; time only the round trip to the database.
      const conn = await connection(ctx);
      const started = performance.now();
      const { rows } = await execute(conn, "SELECT sqlite_version() AS v");
      latencyMs = Math.round((performance.now() - started) * 10) / 10;
      version = String(rows[0]?.v ?? "");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    let usage: { rowsRead: number, rowsWritten: number, storageBytes: number } | undefined;
    if(!local && a.name) {
      const org = await orgOf(ctx, r);
      const u = await platform<{ total?: { rows_read: number, rows_written: number, storage_bytes: number } }>(ctx, `/organizations/${encodeURIComponent(org)}/databases/${encodeURIComponent(a.name)}/usage`).catch(() => undefined);
      if(u?.total) usage = { rowsRead: u.total.rows_read, rowsWritten: u.total.rows_written, storageBytes: u.total.storage_bytes };
    }

    return {
      local,
      name: a.name ?? r.logicalId,
      url: a.url,
      hostname: a.hostname,
      regions: a.regions ?? (a.primaryRegion ? [a.primaryRegion] : []),
      primaryRegion: a.primaryRegion,
      group: a.group,
      groupFqn: a.group ? stackFqn(ctx, "Turso.Group", g => g.name === a.group)[0] : undefined,
      tokens: stackFqn(ctx, "Turso.DatabaseToken", t => t.database === a.name),
      flags: { blockReads: !!a.blockReads, blockWrites: !!a.blockWrites, deleteProtection: !!a.deleteProtection },
      migrations: { dir: a.migrationsDir, table: a.migrationsTable, applied: Object.keys(a.migrationsHashes ?? {}), imports: Object.keys(a.importHashes ?? {}) },
      ok: !error,
      error,
      version,
      latencyMs,
      usage
    };
  },

  tables: async (_: undefined, ctx): Promise<TableInfo[]> => {
    const conn = await connection(ctx);
    const tables = await listTables(conn);
    if(tables.length === 0) return [];
    // One round trip for every count; a view that fails to count reads as unknown.
    const counts = await Promise.all(tables.map(t => execute(conn, `SELECT COUNT(*) AS n FROM ${quote(t.name)}`).then(r => Number(r.rows[0]?.n ?? 0), () => null)));
    return tables
      .map((t, i) => ({ ...t, rows: counts[i] ?? null, internal: t.name.startsWith("__") }))
      .sort((a, b) => Number(a.internal) - Number(b.internal) || a.name.localeCompare(b.name));
  },

  /** Every table and its columns, for SQL autocomplete. */
  schema: async (_: undefined, ctx): Promise<Record<string, string[]>> => {
    const conn = await connection(ctx);
    const tables = await listTables(conn);
    const results = tables.length ? await pipeline(conn, tables.map(t => ({ sql: `PRAGMA table_info(${quote(t.name)})` }))) : [];
    return Object.fromEntries(tables.map((t, i) => [t.name, results[i]!.rows.map(c => String(c.name))]));
  },

  /** A page of rows. The cursor is the offset of the next page. */
  rows: handler(z.object({ table: z.string().min(1), cursor: z.string().regex(/^\d+$/).optional() }), async (input, ctx) => {
    const conn = await connection(ctx);
    // Only interpolate a name that exists, so the table name can't inject SQL.
    if(!(await listTables(conn)).some(t => t.name === input.table)) throw new Error(`No table '${input.table}'.`);
    const offset = Number(input.cursor ?? 0);
    const [columns, [page, total]] = await Promise.all([
      columnsOf(conn, input.table),
      pipeline(conn, [
        { sql: `SELECT * FROM ${quote(input.table)} LIMIT ? OFFSET ?`, args: [PAGE, offset] },
        { sql: `SELECT COUNT(*) AS n FROM ${quote(input.table)}` }
      ])
    ]);
    const count = Number(total!.rows[0]?.n ?? page!.rows.length);
    return {
      columns,
      rows: page!.rows,
      total: count,
      cursor: offset + page!.rows.length < count ? String(offset + page!.rows.length) : undefined
    };
  }),

  /** Runs one statement. On a cloud database this is the real database: writes go through. */
  query: handler(z.object({ sql: z.string().trim().min(1, "Enter a SQL statement") }), async (input, ctx) => {
    const conn = await connection(ctx);
    const started = performance.now();
    const result = await execute(conn, input.sql);
    return {
      rows: result.rows,
      meta: {
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        rowsRead: result.rowsRead,
        rowsWritten: result.rowsWritten,
        changes: result.changes
      }
    };
  })
});
