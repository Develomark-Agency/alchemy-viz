import { z } from "zod";
import { defineServer, handler, requireResource } from "../../../server/define.ts";
import type { KVNamespace } from "../bindings.ts";
import { localBinding } from "../runtime.ts";

export interface KvKey {
  name: string,
  expiration?: number,
  metadata?: unknown
}

export default defineServer({
  list: handler(z.object({ prefix: z.string().default(""), cursor: z.string().optional() }), async (input, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    const page = await kv.list({ prefix: input.prefix || undefined, cursor: input.cursor, limit: 200 });
    return {
      keys: page.keys as KvKey[],
      cursor: page.list_complete ? undefined : page.cursor
    };
  }),

  get: handler(z.object({ key: z.string().min(1) }), async (input, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    const { value, metadata } = await kv.getWithMetadata(input.key, "text");
    return { key: input.key, value, metadata: metadata ?? null };
  }),

  put: handler(
    z.object({
      key: z.string().min(1, "Key is required"),
      value: z.string(),
      metadata: z.unknown().optional(),
      expirationTtl: z.number().int().min(60, "Expiry must be at least 60 seconds").optional()
    }),
    async (input, ctx) => {
      const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
      await kv.put(input.key, input.value, { metadata: input.metadata ?? undefined, expirationTtl: input.expirationTtl });
      return { key: input.key };
    }
  ),

  delete: handler(z.object({ key: z.string().min(1) }), async (input, ctx) => {
    const kv = await localBinding<KVNamespace>(ctx, requireResource(ctx));
    await kv.delete(input.key);
    return { key: input.key };
  })
});
