/**
 * The one thing the Hyperdrive view needs from a database driver: run a
 * statement, with optional bound parameters, and get rows back.
 *
 * Postgres goes through `postgres` (Postgres.js) and MySQL through
 * `mysql2`, on Node and Bun alike. Each is imported the first time a
 * Hyperdrive of that kind is opened.
 */

export interface QueryResult {
  rows: Array<Record<string, unknown>>,
  /** Rows a write statement changed; 0 for reads. */
  changes: number
}

export interface SqlClient {
  /** Placeholders are `$1, $2, ...` for Postgres and `?` for MySQL; see `placeholder`. */
  query(text: string, params?: unknown[]): Promise<QueryResult>,
  close(): Promise<void>
}

export type Dialect = "postgres" | "mysql";

/** The `index`th (from 1) bound parameter's placeholder in the dialect. */
export function placeholder(dialect: Dialect, index: number) {
  return dialect === "mysql" ? "?" : `$${index}`;
}

export async function connect(dialect: Dialect, url: string): Promise<SqlClient> {
  return dialect === "mysql" ? connectMysql(url) : connectPostgres(url);
}

async function connectPostgres(url: string): Promise<SqlClient> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 3, idle_timeout: 30, connect_timeout: 5, onnotice: () => {} });
  return {
    async query(text, params) {
      const result = await sql.unsafe(text, (params ?? []) as never[]);
      const rows = [...result] as Array<Record<string, unknown>>;
      return { rows, changes: result.command && result.command !== "SELECT" ? Number(result.count ?? 0) : 0 };
    },
    close: () => sql.end({ timeout: 5 })
  };
}

async function connectMysql(url: string): Promise<SqlClient> {
  const { createPool } = await import("mysql2/promise");
  const pool = createPool({
    uri: url,
    connectionLimit: 3,
    idleTimeout: 30_000,
    connectTimeout: 5_000,
    // Big integers as strings, like Postgres.js, rather than imprecise numbers.
    supportBigNumbers: true,
    bigNumberStrings: true
  });
  return {
    async query(text, params) {
      const [result] = await pool.query(text, params ?? []);
      if(Array.isArray(result)) return { rows: result as Array<Record<string, unknown>>, changes: 0 };
      return { rows: [], changes: Number((result as { affectedRows?: number }).affectedRows ?? 0) };
    },
    close: () => pool.end()
  };
}
