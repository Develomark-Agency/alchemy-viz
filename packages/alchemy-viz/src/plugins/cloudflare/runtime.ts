/**
 * Node-side access to the local Cloudflare simulators that `alchemy dev`
 * runs.
 *
 * `alchemy dev` persists simulator data under `.alchemy/local`. We open a
 * workerd instance over that same directory with Alchemy's own platform
 * proxy (`@alchemy.run/cloudflare-runtime`, resolved from the project so
 * versions match) and talk to the native KV/D1/R2 bindings from Node.
 * Reads and writes are shared with the running dev workers.
 *
 * One proxy hosts every local data resource of the stack. It is reopened
 * only when that set changes (a resource is added or removed).
 */
import { resolve } from "node:path";
import type { HandlerContext } from "../../server/define.ts";
import type { ResourceInfo } from "../../types.ts";

export type DataKind = "kv" | "d1" | "r2";

/** The local simulator id a data resource is stored under, or undefined if it isn't local. */
export function localDataId(r: ResourceInfo): { kind: DataKind, id: string, instant?: boolean } | undefined {
  const attr = r.attr ?? {};
  function pick(kind: DataKind, id: unknown, instant?: boolean) {
    return typeof id === "string" && id.startsWith("dev:") ? { kind, id, instant } : undefined;
  }
  if(r.type === "Cloudflare.KV.Namespace") return pick("kv", attr.namespaceId);
  if(r.type === "Cloudflare.KV.InstantNamespace") return pick("kv", attr.namespaceId, true);
  if(r.type === "Cloudflare.D1Database" || r.type === "Cloudflare.D1.Database") return pick("d1", attr.databaseId);
  if(r.type === "Cloudflare.R2.Bucket") return pick("r2", attr.bucketName);
  return undefined;
}

function bindingName(kind: DataKind, id: string) {
  return `${kind.toUpperCase()}_${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

interface Proxy {
  env: Record<string, any>,
  dispose: () => Promise<void>
}

let current: { key: string, proxy: Promise<Proxy> } | undefined;

async function open(ctx: HandlerContext, wanted: Array<{ kind: DataKind, id: string, instant?: boolean }>) {
  const via = { via: "@alchemy.run/cloudflare" };
  const [{ getPlatformProxy }, bindings] = await Promise.all([
    ctx.importFromProject("@alchemy.run/cloudflare-runtime/core/platform-proxy", via),
    ctx.importFromProject("@alchemy.run/cloudflare-runtime/core/bindings", via)
  ]);
  return (await getPlatformProxy({
    name: "alchemy-viz",
    persist: { directory: resolve(ctx.root, ".alchemy", "local") },
    bindings: wanted.map(({ kind, id, instant }) => {
      const binding = bindingName(kind, id);
      if(kind === "kv") return bindings.KvNamespace.local({ binding, id, mode: instant ? "instant" : undefined });
      if(kind === "d1") return bindings.D1.local({ binding, id });
      return bindings.R2Bucket.local({ binding, id });
    })
  })) as Proxy;
}

/** The native binding (KVNamespace, D1Database or R2Bucket) for a local resource. */
export async function localBinding<T = any>(ctx: HandlerContext, resource: ResourceInfo): Promise<T> {
  const target = localDataId(resource);
  if(!target) {
    throw new Error(`${resource.fqn} isn't running in a local simulator, so it can't be read here.`);
  }
  const wanted = ctx.stack.resources.map(localDataId).filter(x => x !== undefined);
  const key = wanted
    .map(w => `${w.kind}:${w.id}`)
    .sort()
    .join(",");
  if(!current || current.key !== key) {
    const previous = current;
    const next = { key, proxy: open(ctx, wanted) };
    current = next;
    next.proxy.catch(() => {
      if(current === next) current = undefined;
    });
    previous?.proxy.then(p => p.dispose()).catch(() => {});
  }
  const proxy = await current.proxy;
  return proxy.env[bindingName(target.kind, target.id)] as T;
}

export async function disposeLocalRuntime() {
  const p = current;
  current = undefined;
  await p?.proxy.then(x => x.dispose()).catch(() => {});
}
