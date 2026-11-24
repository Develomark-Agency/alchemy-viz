import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import { localBinding } from "../runtime.ts";

/**
 * A local Secrets Store is a key-value namespace of secret name → value
 * (the admin surface Alchemy's own local Secret provider seeds through).
 * The same handlers serve a store and a single Secret: a Secret resource
 * resolves to its store, scoped to its own name.
 */

interface StoreAdmin {
  list(options?: { cursor?: string, limit?: number }): Promise<{ keys: Array<{ name: string }>, list_complete: boolean, cursor?: string }>,
  get(key: string): Promise<string | null>,
  put(key: string, value: string): Promise<void>,
  delete(key: string): Promise<void>
}

export interface SecretEntry {
  name: string,
  /** The stack resource that declares this secret; deploys write its value. */
  managedBy?: string
}

function store(ctx: HandlerContext) {
  return localBinding<StoreAdmin>(ctx, requireResource(ctx));
}

/** Secret names this stack declares in the resource's store, by name → fqn. */
function managed(ctx: HandlerContext) {
  const storeId = requireResource(ctx).attr?.storeId;
  return new Map(ctx.stack.resources
    .filter(r => r.type === "Cloudflare.SecretsStore.Secret" && r.attr?.storeId === storeId && typeof r.attr?.secretName === "string")
    .map(r => [r.attr.secretName as string, r.fqn]));
}

/** A Secret resource may only touch its own name. */
function checkScope(ctx: HandlerContext, name: string) {
  const r = requireResource(ctx);
  if(r.type === "Cloudflare.SecretsStore.Secret" && r.attr?.secretName !== name) {
    throw new Error(`This view is scoped to the secret '${r.attr?.secretName}'.`);
  }
}

const name = z.string().min(1, "Name is required").max(255).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, - and _");

export default defineServer({
  list: async (_: undefined, ctx): Promise<SecretEntry[]> => {
    const s = await store(ctx);
    const owners = managed(ctx);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await s.list({ cursor, limit: 1000 });
      names.push(...page.keys.map(k => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while(cursor);
    const r = requireResource(ctx);
    const scoped = r.type === "Cloudflare.SecretsStore.Secret" ? names.filter(n => n === r.attr?.secretName) : names;
    return scoped.sort().map(n => ({ name: n, managedBy: owners.get(n) }));
  },

  /** A secret's value. Only sent when asked for, never with the list. */
  reveal: handler(z.object({ name }), async (input, ctx) => {
    checkScope(ctx, input.name);
    const value = await (await store(ctx)).get(input.name);
    if(value === null) throw new Error(`No secret '${input.name}' in this store.`);
    return { name: input.name, value };
  }),

  put: handler(z.object({ name, value: z.string().min(1, "Enter a value") }), async (input, ctx) => {
    checkScope(ctx, input.name);
    await (await store(ctx)).put(input.name, input.value);
    return { name: input.name };
  }),

  delete: handler(z.object({ name }), async (input, ctx) => {
    checkScope(ctx, input.name);
    await (await store(ctx)).delete(input.name);
    return { name: input.name };
  })
});
