import { join } from "node:path";
import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import { namespacesOf } from "./namespaces.ts";
import { listObjects, listTables, localRoot, queryObject, readKv, readTable, withObject } from "../do-storage.ts";

export interface Namespace {
  className: string,
  /** The storage directory under `.alchemy/local`. */
  namespaceId: string,
  objects: number,
  /** Bytes on disk across every object. */
  size: number
}

function namespaceDir(ctx: HandlerContext, className: string) {
  const ns = namespacesOf(requireResource(ctx)).find(n => n.className === className);
  if(!ns) throw new Error(`This Worker has no Durable Object class '${className}'.`);
  return join(localRoot(ctx.root), ns.namespaceId);
}

function objectFile(ctx: HandlerContext, className: string, id: string) {
  const object = listObjects(namespaceDir(ctx, className)).find(o => o.id === id);
  if(!object) throw new Error(`No stored object ${id.slice(0, 12)}… in ${className}. It may have been deleted.`);
  return object.file;
}

const objectInput = z.object({ className: z.string().min(1), id: z.string().regex(/^[0-9a-f]{8,}$/, "Not an object id") });
const PAGE = 100;

export default defineServer({
  namespaces: async (_: undefined, ctx): Promise<Namespace[]> => namespacesOf(requireResource(ctx)).map(ns => {
    const objects = listObjects(join(localRoot(ctx.root), ns.namespaceId));
    return { ...ns, objects: objects.length, size: objects.reduce((n, o) => n + o.size, 0) };
  }),

  /** Objects that have written storage, most recent first. Objects that never wrote leave no file. */
  objects: handler(z.object({ className: z.string().min(1) }), async (input, ctx) => listObjects(namespaceDir(ctx, input.className)).map(({ file: _file, ...o }) => o)),

  /** An object's storage at a glance: key count and SQL tables. */
  object: handler(objectInput, async (input, ctx) => withObject(objectFile(ctx, input.className, input.id), db => ({
    keys: readKv(db, { limit: 0 }).total,
    tables: listTables(db)
  }))),

  kv: handler(objectInput.extend({ prefix: z.string().default(""), cursor: z.string().regex(/^\d+$/).optional() }), async (input, ctx) => withObject(objectFile(ctx, input.className, input.id), db => {
    const offset = Number(input.cursor ?? 0);
    const { entries, total } = readKv(db, { prefix: input.prefix, limit: PAGE, offset });
    return { entries, total, cursor: offset + entries.length < total ? String(offset + entries.length) : undefined };
  })),

  rows: handler(objectInput.extend({ table: z.string().min(1), cursor: z.string().regex(/^\d+$/).optional() }), async (input, ctx) => withObject(objectFile(ctx, input.className, input.id), db => {
    const offset = Number(input.cursor ?? 0);
    const total = listTables(db).find(t => t.name === input.table)?.rows ?? 0;
    const page = readTable(db, input.table, offset, PAGE);
    return { ...page, total, cursor: offset + page.rows.length < total ? String(offset + page.rows.length) : undefined };
  })),

  /** A read-only SQL statement against the object's storage. Writes are refused by the connection. */
  query: handler(objectInput.extend({ sql: z.string().trim().min(1, "Enter a SQL statement") }), async (input, ctx) => withObject(objectFile(ctx, input.className, input.id), db => queryObject(db, input.sql)))
});
