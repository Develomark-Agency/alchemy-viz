/**
 * Server-side access to Turso: the Platform API (organizations, groups,
 * databases, tokens) and the SQL endpoint every database serves (Hrana over
 * HTTP).
 *
 * Credentials come from the project's own `@alchemy.run/turso`, through
 * Alchemy's auth resolution: `TURSO_API_TOKEN` (or `TURSO_API_KEY`) when set,
 * otherwise the selected Alchemy profile. That is exactly what `alchemy dev`
 * and `alchemy deploy` use, so the dashboard sees the organization the stack
 * was deployed to. The token never leaves this process.
 */
import type { HandlerContext } from "../../server/define.ts";
import type { ResourceInfo } from "../../types.ts";

export interface PlatformCredentials {
  apiToken: string,
  baseUrl: string,
  /** The organization the credentials act on (set, or discovered from the token). */
  organization: string
}

let credentials: Promise<PlatformCredentials> | undefined;

async function resolveCredentials(ctx: HandlerContext): Promise<PlatformCredentials> {
  const via = { via: "@alchemy.run/turso" };
  let Turso: any;
  try {
    Turso = await ctx.importFromProject("@alchemy.run/turso");
  } catch {
    throw new Error("Install @alchemy.run/turso in this project to explore Turso resources.");
  }
  const [Effect, Layer, Redacted, Alchemist, Auth] = await Promise.all([
    ctx.importFromProject("effect/Effect", via),
    ctx.importFromProject("effect/Layer", via),
    ctx.importFromProject("effect/Redacted", via),
    ctx.importFromProject("alchemy/Alchemist", via),
    ctx.importFromProject("alchemy/Auth/AuthProvider", via)
  ]);
  const program = Effect.gen(function* () {
    const creds = yield* yield* Turso.Credentials;
    const organization: string = yield* yield* Turso.Organization;
    return { apiToken: Redacted.value(creds.apiKey) as string, baseUrl: creds.apiBaseUrl as string, organization };
  });
  const layer = Turso.providers().pipe(Layer.provideMerge(Layer.mergeAll(Alchemist.layer(), Auth.AuthProvidersLive)));
  try {
    return await Effect.runPromise(program.pipe(Effect.provide(layer), Effect.scoped));
  } catch (e) {
    // Alchemy's own message says what to do ("Set TURSO_API_TOKEN", "Run alchemy profile edit ...").
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`No Turso credentials: ${message}`);
  }
}

/** The Platform API credentials, resolved once per process. A failure is retried on the next call. */
export function platformCredentials(ctx: HandlerContext) {
  credentials ??= resolveCredentials(ctx).catch(e => {
    credentials = undefined;
    throw e;
  });
  return credentials;
}

export class PlatformError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/** Calls the Platform API (`/v1…`) with the project's Turso credentials. */
export async function platform<T = any>(ctx: HandlerContext, path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const creds = await platformCredentials(ctx);
  const res = await fetch(`${creds.baseUrl}/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${init?.token ?? creds.apiToken}`, ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }
  });
  const text = await res.text();
  const body = text ? safeJson(text) : undefined;
  if(!res.ok) {
    const b = body as { error?: string, code?: string } | undefined;
    throw new PlatformError(b?.error ?? `Turso API ${res.status} ${res.statusText}`, res.status, b?.code);
  }
  return body as T;
}

/** The organization path segment for a resource: its own, else the credentials'. */
export async function orgOf(ctx: HandlerContext, r?: ResourceInfo) {
  const own = r?.attr?.organization;
  if(typeof own === "string" && own) return own;
  return (await platformCredentials(ctx)).organization;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

/** A Redacted attribute as plain text: an Effect `Redacted` once decoded, `{ __redacted__ }` on disk. */
export async function reveal(ctx: HandlerContext, value: unknown): Promise<string | undefined> {
  if(typeof value === "string") return value === "<redacted>" ? undefined : value;
  if(value && typeof value === "object" && "__redacted__" in value) return String((value as { __redacted__: unknown }).__redacted__);
  const Redacted = await ctx.importFromProject<typeof import("effect/Redacted")>("effect/Redacted", { via: "alchemy" });
  return Redacted.isRedacted(value) ? String(Redacted.value(value)) : undefined;
}

/** The claims of a Turso JWT, read without verifying it (the server does that). */
export function decodeJwt(token: string): Record<string, unknown> | undefined {
  const part = token.split(".")[1];
  if(!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// SQL over Hrana (https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md)
// ---------------------------------------------------------------------------

/** Where to send SQL: a database's HTTP URL and, for the cloud, a token. */
export interface SqlConnection {
  url: string,
  token?: string
}

type HranaValue =
  | { type: "null" }
  | { type: "integer", value: string }
  | { type: "float", value: number }
  | { type: "text", value: string }
  | { type: "blob", base64: string };

interface HranaResult {
  cols: Array<{ name: string | null, decltype?: string | null }>,
  rows: HranaValue[][],
  affected_row_count: number,
  last_insert_rowid: string | null,
  rows_read?: number,
  rows_written?: number,
  query_duration_ms?: number
}

export interface SqlResult {
  columns: string[],
  rows: Array<Record<string, unknown>>,
  changes: number,
  rowsRead: number,
  rowsWritten: number
}

function toValue(v: unknown): HranaValue {
  if(v === null || v === undefined) return { type: "null" };
  if(typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if(typeof v === "bigint") return { type: "integer", value: v.toString() };
  if(typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

/** JSON-safe: integers past 2^53 stay strings, blobs are summarized. */
function fromValue(v: HranaValue): unknown {
  switch(v.type) {
    case "null": return null;
    case "integer": {
      const n = Number(v.value);
      return Number.isSafeInteger(n) ? n : v.value;
    }
    case "float": return v.value;
    case "text": return v.value;
    case "blob": return `<${Buffer.from(v.base64, "base64").byteLength} bytes>`;
  }
}

/** Runs statements in one pipeline, in order, and returns each result. */
export async function pipeline(conn: SqlConnection, statements: Array<{ sql: string, args?: unknown[] }>): Promise<SqlResult[]> {
  const res = await fetch(`${conn.url.replace(/\/$/, "")}/v2/pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(conn.token ? { authorization: `Bearer ${conn.token}` } : {}) },
    body: JSON.stringify({
      requests: [...statements.map(s => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(toValue) } })), { type: "close" }]
    })
  });
  if(!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(res.status === 401 || res.status === 403 ? `The database refused the token (HTTP ${res.status}).` : `SQL request failed with HTTP ${res.status}${text ? `: ${text}` : ""}`);
  }
  const body = await res.json() as { results: Array<{ type: "ok", response: { result: HranaResult } } | { type: "error", error: { message: string } }> };
  return body.results.slice(0, statements.length).map(r => {
    if(r.type === "error") throw new Error(r.error.message);
    const { cols, rows, affected_row_count, rows_read, rows_written } = r.response.result;
    const names = cols.map((c, i) => c.name ?? String(i));
    return {
      columns: names,
      rows: rows.map(row => Object.fromEntries(names.map((n, i) => [n, fromValue(row[i]!)]))),
      changes: affected_row_count,
      rowsRead: rows_read ?? 0,
      rowsWritten: rows_written ?? 0
    };
  });
}

export async function execute(conn: SqlConnection, sql: string, args?: unknown[]) {
  return (await pipeline(conn, [{ sql, args }]))[0]!;
}

/** Whether a database URL points at a server on this machine (a local libSQL server), which needs no token. */
export function isLocalUrl(url: string) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);
}

const minted = new Map<string, { token: string, expires: number }>();

/**
 * A short-lived full-access token for one cloud database, minted with the
 * Platform API and reused until shortly before it expires.
 */
export async function databaseToken(ctx: HandlerContext, org: string, name: string) {
  const key = `${org}/${name}`;
  const cached = minted.get(key);
  if(cached && cached.expires > Date.now() + 60_000) return cached.token;
  const { jwt } = await platform<{ jwt: string }>(ctx, `/organizations/${encodeURIComponent(org)}/databases/${encodeURIComponent(name)}/auth/tokens?expiration=1h&authorization=full-access`, { method: "POST" });
  minted.set(key, { token: jwt, expires: Date.now() + 60 * 60_000 });
  return jwt;
}
