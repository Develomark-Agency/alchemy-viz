import { defineServer, requireResource } from "../../../server/define.ts";
import type { KVNamespace } from "../bindings.ts";
import { localBinding } from "../runtime.ts";

export interface KvKey {
  name: string,
  expiration?: number,
  metadata?: unknown
}

export default defineServer({
  list: async (input: { prefix?: string, cursor?: string, limit?: number }, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    const page = await kv.list({ prefix: input.prefix || undefined, cursor: input.cursor || undefined, limit: input.limit ?? 100 });
    return {
      keys: page.keys as KvKey[],
      cursor: page.list_complete ? undefined : page.cursor
    };
  },

  get: async (input: { key: string }, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    const { value, metadata } = await kv.getWithMetadata(input.key, "text");
    return { key: input.key, value, metadata: metadata ?? null };
  },

  put: async (input: { key: string, value: string, metadata?: unknown, expirationTtl?: number }, ctx) => {
    if(!input.key) throw new Error("Key is required.");
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    await kv.put(input.key, input.value, {
      metadata: input.metadata ?? undefined,
      expirationTtl: input.expirationTtl || undefined
    });
    return { ok: true };
  },

  delete: async (input: { key: string }, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    await kv.delete(input.key);
    return { ok: true };
  }
});
