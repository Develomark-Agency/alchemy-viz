/**
 * The slices of the Workers binding APIs these views use. Kept local
 * because `@cloudflare/workers-types` redefines DOM globals (Response,
 * Request, ...) and can't share a program with the browser code.
 */

export interface KVNamespace {
  list(options?: { prefix?: string, cursor?: string, limit?: number }): Promise<{
    keys: Array<{ name: string, expiration?: number, metadata?: unknown }>,
    list_complete: boolean,
    cursor?: string
  }>,
  getWithMetadata(key: string, type: "text"): Promise<{ value: string | null, metadata: unknown }>,
  put(key: string, value: string, options?: { metadata?: unknown, expirationTtl?: number }): Promise<void>,
  delete(key: string): Promise<void>
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[],
  success: boolean,
  meta: { duration?: number, rows_read?: number, rows_written?: number, changes?: number, last_row_id?: number }
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement,
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>,
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

export interface R2Object {
  key: string,
  size: number,
  etag: string,
  uploaded: Date,
  httpMetadata?: { contentType?: string, contentDisposition?: string, cacheControl?: string },
  customMetadata?: Record<string, string>
}

export interface R2ObjectBody extends R2Object {
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface R2Bucket {
  list(options?: {
    prefix?: string,
    cursor?: string,
    delimiter?: string,
    limit?: number,
    include?: Array<"httpMetadata" | "customMetadata">
  }): Promise<{ objects: R2Object[], delimitedPrefixes: string[], truncated: boolean, cursor?: string }>,
  head(key: string): Promise<R2Object | null>,
  get(key: string): Promise<R2ObjectBody | null>,
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2Object>,
  delete(key: string): Promise<void>
}
