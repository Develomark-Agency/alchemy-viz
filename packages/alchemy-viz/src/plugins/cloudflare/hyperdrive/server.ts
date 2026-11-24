import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import type { ColumnInfo, TableInfo } from "../d1/server.ts";
import { connect, type Dialect, placeholder, type SqlClient } from "./client.ts";

/**
 * A Hyperdrive's database, as `alchemy dev` reaches it.
 *
 * Locally Hyperdrive doesn't pool or cache: the Worker binding connects
 * straight to the config's `dev` origin, whose credentials Alchemy keeps in
 * local state. This connects to the same origin with a Postgres or MySQL
 * client and answers in the D1 view's shapes, so the same table browser
 * and SQL console serve both.
 */

interface DevOrigin {
  scheme: "postgres" | "postgresql" | "mysql",
  host: string,
  port?: number,
  database: string,
  user: string,
  password: unknown,
  sslmode?: string
}

/** The password as state holds it: an Effect `Redacted` once decoded, `{ __redacted__ }` on disk. */
async function secret(ctx: HandlerContext, value: unknown) {
  if(typeof value === "string") return value === "<redacted>" ? undefined : value;
  if(value && typeof value === "object" && "__redacted__" in value) return String((value as { __redacted__: unknown }).__redacted__);
  const Redacted = await ctx.importFromProject<typeof import("effect/Redacted")>("effect/Redacted", { via: "alchemy" });
  return Redacted.isRedacted(value) ? String(Redacted.value(value)) : undefined;
}

function devOrigin(ctx: HandlerContext): DevOrigin {
  const r = requireResource(ctx);
  const dev = r.attr?.dev as DevOrigin | undefined;
  if(!dev?.host) {
    throw new Error("This Hyperdrive has no `dev` origin, so alchemy dev doesn't run it locally. Add `dev: { host, port, database, user, password }` to its props.");
  }
  return dev;
}

function isMysql(o: DevOrigin) {
  return o.scheme === "mysql";
}

function dialect(o: DevOrigin): Dialect {
  return isMysql(o) ? "mysql" : "postgres";
}

async function url(ctx: HandlerContext, o: DevOrigin) {
  const scheme = isMysql(o) ? "mysql" : "postgres";
  const port = o.port ?? (isMysql(o) ? 3306 : 5432);
  const auth = `${encodeURIComponent(o.user)}:${encodeURIComponent((await secret(ctx, o.password)) ?? "")}`;
  const ssl = !isMysql(o) && o.sslmode ? `?sslmode=${o.sslmode === "verify-ca" || o.sslmode === "verify-full" ? "require" : o.sslmode}` : "";
  return `${scheme}://${auth}@${o.host}:${port}/${encodeURIComponent(o.database)}${ssl}`;
}

const clients = new Map<string, Promise<SqlClient>>();

async function client(ctx: HandlerContext) {
  const o = devOrigin(ctx);
  const key = await url(ctx, o);
  let sql = clients.get(key);
  if(!sql) {
    sql = connect(dialect(o), key);
    clients.set(key, sql);
    sql.catch(() => clients.delete(key));
  }
  return { sql: await sql, origin: o };
}

export async function closeHyperdriveClients() {
  const all = [...clients.values()];
  clients.clear();
  await Promise.all(all.map(c => c.then(sql => sql.close()).catch(() => {})));
}

/** Rows made JSON-safe: big integers as strings, binary summarized. */
function plain(rows: unknown[]) {
  return rows.map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => {
    if(typeof v === "bigint") return [k, v.toString()];
    if(v instanceof Uint8Array) return [k, `<${v.byteLength} bytes>`];
    return [k, v];
  })));
}

function quote(o: DevOrigin, identifier: string) {
  return isMysql(o) ? `\`${identifier.replace(/`/g, "``")}\`` : `"${identifier.replace(/"/g, "\"\"")}"`;
}

interface Table {
  schema: string,
  name: string,
  type: "table" | "view",
  /** How the browser names it: `public` tables bare, others schema-qualified. */
  label: string
}

async function listTables(sql: SqlClient, o: DevOrigin): Promise<Table[]> {
  const { rows } = isMysql(o)
    ? await sql.query("SELECT table_schema AS s, table_name AS n, table_type AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name")
    : await sql.query("SELECT table_schema AS s, table_name AS n, table_type AS t FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema <> 'public', table_schema, table_name");
  return (rows as Array<{ s: string, n: string, t: string }>).map(r => ({
    schema: r.s,
    name: r.n,
    type: /view/i.test(r.t) ? "view" : "table",
    label: isMysql(o) || r.s === "public" ? r.n : `${r.s}.${r.n}`
  }));
}

function qualified(o: DevOrigin, t: Table) {
  return isMysql(o) ? quote(o, t.name) : `${quote(o, t.schema)}.${quote(o, t.name)}`;
}

async function columnsOf(sql: SqlClient, o: DevOrigin, t: Table): Promise<ColumnInfo[]> {
  const [p1, p2] = [placeholder(dialect(o), 1), placeholder(dialect(o), 2)];
  const cols = (await sql.query(`
    SELECT c.column_name AS name, c.data_type AS type, c.is_nullable AS nullable, c.ordinal_position AS pos
    FROM information_schema.columns c WHERE c.table_schema = ${p1} AND c.table_name = ${p2} ORDER BY c.ordinal_position
  `, [t.schema, t.name])).rows as Array<{ name: string, type: string, nullable: string }>;
  const keys = (await sql.query(`
    SELECT k.column_name AS name, k.ordinal_position AS pos
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema AND k.table_name = tc.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = ${p1} AND tc.table_name = ${p2}
  `, [t.schema, t.name])).rows as Array<{ name: string, pos: number }>;
  return cols.map(c => ({ name: c.name, type: c.type, pk: Number(keys.find(k => k.name === c.name)?.pos ?? 0), notnull: c.nullable === "NO" }));
}

async function count(sql: SqlClient, o: DevOrigin, t: Table) {
  const [row] = (await sql.query(`SELECT COUNT(*) AS n FROM ${qualified(o, t)}`)).rows as Array<{ n: number | string | bigint }>;
  return Number(row?.n ?? 0);
}

async function findTable(sql: SqlClient, o: DevOrigin, label: string) {
  // Only interpolate names that exist, so a table name can't inject SQL.
  const t = (await listTables(sql, o)).find(x => x.label === label);
  if(!t) throw new Error(`No table '${label}'.`);
  return t;
}

const PAGE = 100;

export default defineServer({
  /** The dev origin (without its password), the connected Workers, and whether it answers. */
  connection: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const o = devOrigin(ctx);
    const workers = ctx.stack.resources
      .filter(w => w.type === "Cloudflare.Worker" && w.bindings.some(b => ((b.data as { bindings?: Array<Record<string, unknown>> })?.bindings ?? [])
        .some(x => x.type === "hyperdrive" && x.id === r.attr?.hyperdriveId)))
      .map(w => w.fqn);
    const started = performance.now();
    let version: string | undefined;
    let error: string | undefined;
    try {
      const [row] = (await (await client(ctx)).sql.query("SELECT version() AS v")).rows as Array<{ v: string }>;
      version = row?.v;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return {
      scheme: isMysql(o) ? "mysql" : "postgres",
      host: o.host,
      port: o.port ?? (isMysql(o) ? 3306 : 5432),
      database: o.database,
      user: o.user,
      sslmode: o.sslmode,
      workers,
      ok: !error,
      error,
      version,
      latencyMs: error ? undefined : Math.round((performance.now() - started) * 10) / 10
    };
  },

  tables: async (_: undefined, ctx): Promise<TableInfo[]> => {
    const { sql, origin } = await client(ctx);
    const tables = await listTables(sql, origin);
    return Promise.all(tables.map(async t => ({
      name: t.label,
      type: t.type,
      rows: await count(sql, origin, t).catch(() => null),
      internal: !isMysql(origin) && t.schema !== "public"
    })));
  },

  /** Every table and its columns, for SQL autocomplete. */
  schema: async (_: undefined, ctx): Promise<Record<string, string[]>> => {
    const { sql, origin } = await client(ctx);
    const tables = await listTables(sql, origin);
    const entries = await Promise.all(tables.map(async t => [t.label, (await columnsOf(sql, origin, t)).map(c => c.name)] as const));
    return Object.fromEntries(entries);
  },

  /** A page of rows. The cursor is the offset of the next page. */
  rows: handler(z.object({ table: z.string().min(1), cursor: z.string().regex(/^\d+$/).optional() }), async (input, ctx) => {
    const { sql, origin } = await client(ctx);
    const t = await findTable(sql, origin, input.table);
    const offset = Number(input.cursor ?? 0);
    const columns = await columnsOf(sql, origin, t);
    const keys = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => quote(origin, c.name));
    // Postgres has no stable row order without one: page by the primary key.
    const order = keys.length ? ` ORDER BY ${keys.join(", ")}` : "";
    const [{ rows }, total] = await Promise.all([
      sql.query(`SELECT * FROM ${qualified(origin, t)}${order} LIMIT ${PAGE} OFFSET ${offset}`),
      count(sql, origin, t)
    ]);
    return {
      columns,
      rows: plain(rows),
      total,
      cursor: offset + rows.length < total ? String(offset + rows.length) : undefined
    };
  }),

  /** Runs a statement against the dev database. This is the real local database, so writes go through. */
  query: handler(z.object({ sql: z.string().trim().min(1, "Enter a SQL statement") }), async (input, ctx) => {
    const { sql } = await client(ctx);
    const started = performance.now();
    const result = await sql.query(input.sql);
    const rows = plain(result.rows);
    const changes = result.changes;
    return {
      rows,
      meta: {
        durationMs: Math.round((performance.now() - started) * 10) / 10,
        rowsRead: rows.length,
        rowsWritten: changes,
        changes
      }
    };
  })
});
