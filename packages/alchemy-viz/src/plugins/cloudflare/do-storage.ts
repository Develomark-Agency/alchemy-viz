/**
 * Read-only access to Durable Object storage that `alchemy dev` persists.
 *
 * workerd keeps each Durable Object namespace in a directory under
 * `.alchemy/local`, with one SQLite file per object (named by the object's
 * id) beside a shared `metadata.sqlite`. An object's key-value API lives in
 * its `_cf_KV` table, values V8-serialized; its SQL API tables sit next to
 * it. Workflows run on the same machinery: each instance is an engine
 * object under `.alchemy/local/workflows/<workflow name>`.
 *
 * Files are opened with writes disabled, so a running object never sees
 * its storage change under it.
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { deserializeV8, Unsupported } from "./v8-deserialize.ts";

export function localRoot(root: string) {
  return resolve(root, ".alchemy", "local");
}

export interface ObjectFile {
  /** The object's id: the file name without `.sqlite`. */
  id: string,
  file: string,
  /** Bytes on disk, including the write-ahead log. */
  size: number,
  modified: string
}

/** One entry per object in a namespace directory, most recently written first. */
export function listObjects(dir: string): ObjectFile[] {
  if(!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map(name => {
      const file = join(dir, name);
      const stat = statSync(file);
      const wal = statSync(`${file}-wal`, { throwIfNoEntry: false });
      const modified = Math.max(stat.mtimeMs, wal?.mtimeMs ?? 0);
      return { id: name.slice(0, -".sqlite".length), file, size: stat.size + (wal?.size ?? 0), modified: new Date(modified).toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** Opens one object's storage for reading. Close it when done. */
export function openObject(file: string) {
  // `readonly` can't attach to a database another process holds in WAL
  // mode; open it normally and refuse writes at the connection instead.
  const db = new Database(file, { readwrite: true, create: false });
  db.run("PRAGMA query_only = ON");
  return db;
}

export function withObject<T>(file: string, fn: (db: Database) => T): T {
  const db = openObject(file);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function hasTable(db: Database, name: string) {
  return db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== null;
}

/** A stored value made JSON-safe for the browser. */
export function toJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if(value === undefined) return { $type: "undefined" };
  if(typeof value === "bigint") return { $type: "bigint", value: value.toString() };
  if(typeof value === "number" && !Number.isFinite(value)) return { $type: "number", value: String(value) };
  if(value === null || typeof value !== "object") return value;
  if(value instanceof Unsupported) return { $type: "unsupported", tag: value.tag };
  if(seen.has(value)) return { $type: "circular" };
  seen.add(value);
  if(value instanceof Date) return { $type: "Date", value: Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString() };
  if(value instanceof RegExp) return { $type: "RegExp", value: String(value) };
  if(value instanceof Map) return { $type: "Map", entries: [...value].map(([k, v]) => [toJsonSafe(k, seen), toJsonSafe(v, seen)]) };
  if(value instanceof Set) return { $type: "Set", values: [...value].map(v => toJsonSafe(v, seen)) };
  if(value instanceof Error) return { $type: value.name, message: value.message };
  if(value instanceof ArrayBuffer) return { $type: "ArrayBuffer", bytes: value.byteLength };
  if(ArrayBuffer.isView(value)) return { $type: value.constructor.name, bytes: value.byteLength };
  if(Array.isArray(value)) return value.map(v => toJsonSafe(v, seen));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v, seen)]));
}

export interface KvEntry {
  key: string,
  /** The decoded value, JSON-safe. Absent when it couldn't be decoded. */
  value?: unknown,
  /** Why the value couldn't be decoded. */
  error?: string,
  /** Size of the serialized value. */
  bytes: number
}

/** Decodes one `_cf_KV` value. */
export function decodeValue(raw: Uint8Array): unknown {
  return deserializeV8(raw);
}

/** Keys of the key-value API, in key order. */
export function readKv(db: Database, options: { prefix?: string, limit?: number, offset?: number } = {}): { entries: KvEntry[], total: number } {
  if(!hasTable(db, "_cf_KV")) return { entries: [], total: 0 };
  const prefix = options.prefix ?? "";
  // `key >= prefix AND key < prefix + U+FFFF` is a prefix match that uses the key's index.
  const where = prefix ? "WHERE key >= ?1 AND key < ?1 || char(65535)" : "";
  const params = prefix ? [prefix] : [];
  const total = (db.query(`SELECT COUNT(*) AS n FROM _cf_KV ${where}`).get(...params) as { n: number }).n;
  const rows = db
    .query(`SELECT key, value FROM _cf_KV ${where} ORDER BY key LIMIT ${options.limit ?? 500} OFFSET ${options.offset ?? 0}`)
    .all(...params) as Array<{ key: string, value: Uint8Array }>;
  const entries = rows.map(({ key, value }) => {
    try {
      return { key, value: toJsonSafe(decodeValue(value)), bytes: value.byteLength };
    } catch (e) {
      return { key, error: e instanceof Error ? e.message : String(e), bytes: value.byteLength };
    }
  });
  return { entries, total };
}

/** One value of the key-value API, decoded, or undefined when the key is absent or undecodable. */
export function readKvValue<T = unknown>(db: Database, key: string): T | undefined {
  if(!hasTable(db, "_cf_KV")) return undefined;
  const row = db.query("SELECT value FROM _cf_KV WHERE key = ?").get(key) as { value: Uint8Array } | null;
  if(!row) return undefined;
  try {
    return decodeValue(row.value) as T;
  } catch {
    return undefined;
  }
}

export interface SqlTable {
  name: string,
  rows: number
}

function quote(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

/** Tables the object created with its SQL API (workerd's own `_cf_*` tables left out). */
export function listTables(db: Database): SqlTable[] {
  const names = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  return names.map(({ name }) => ({ name, rows: (db.query(`SELECT COUNT(*) AS n FROM ${quote(name)}`).get() as { n: number }).n }));
}

/** A page of a table's rows, with blobs summarized. */
export function readTable(db: Database, table: string, offset: number, limit: number) {
  if(!listTables(db).some(t => t.name === table)) throw new Error(`No table '${table}'.`);
  const columns = (db.query(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string, type: string, pk: number }>)
    .map(c => ({ name: c.name, type: c.type, pk: c.pk }));
  const rows = (db.query(`SELECT * FROM ${quote(table)} LIMIT ${limit} OFFSET ${offset}`).all() as Array<Record<string, unknown>>)
    .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? `<${v.byteLength} bytes>` : v])));
  return { columns, rows };
}

/** Runs a read-only statement against an object's SQL storage. */
export function queryObject(db: Database, sql: string) {
  const started = performance.now();
  const rows = (db.query(sql).all() as Array<Record<string, unknown>>)
    .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? `<${v.byteLength} bytes>` : v])));
  return { rows, durationMs: Math.round((performance.now() - started) * 10) / 10 };
}
