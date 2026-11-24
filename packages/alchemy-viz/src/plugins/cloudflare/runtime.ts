/**
 * Node-side access to the local Cloudflare simulators that `alchemy dev`
 * runs.
 *
 * `alchemy dev` persists simulator data under `.alchemy/local`. We open a
 * workerd instance over that same directory with Alchemy's own platform
 * proxy (`@alchemy.run/cloudflare-runtime`, resolved from the project so
 * versions match) and talk to native bindings from Node:
 *
 * - KV, D1, R2 and Secrets Store read and write the same storage the dev
 *   workers use.
 * - Queue producers and Workflows go through the dev registry to the
 *   `alchemy dev` process that consumes the queue or runs the workflow, so
 *   a message sent here is delivered to the real consumer.
 *
 * One proxy hosts every local resource of the stack. It is reopened only
 * when that set changes (a resource is added or removed).
 */
import { resolve } from "node:path";
import type { HandlerContext } from "../../server/define.ts";
import type { ResourceInfo } from "../../types.ts";

export type BindingSpec =
  | { kind: "kv", id: string, instant?: boolean }
  | { kind: "d1", id: string }
  | { kind: "r2", id: string }
  | { kind: "queue", queueName: string }
  | { kind: "workflow", workflowName: string, className: string, scriptName: string }
  | { kind: "secrets", storeId: string };

function isLocalId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith("dev:");
}

/** How to bind a local resource in the proxy, or undefined if it isn't local (or has no binding). */
export function localSpec(r: ResourceInfo): BindingSpec | undefined {
  const a = r.attr ?? {};
  switch(r.type) {
    case "Cloudflare.KV.Namespace":
      return isLocalId(a.namespaceId) ? { kind: "kv", id: a.namespaceId } : undefined;
    case "Cloudflare.KV.InstantNamespace":
      return isLocalId(a.namespaceId) ? { kind: "kv", id: a.namespaceId, instant: true } : undefined;
    case "Cloudflare.D1Database":
    case "Cloudflare.D1.Database":
      return isLocalId(a.databaseId) ? { kind: "d1", id: a.databaseId } : undefined;
    case "Cloudflare.R2.Bucket":
      return isLocalId(a.bucketName) ? { kind: "r2", id: a.bucketName } : undefined;
    case "Cloudflare.Queues.Queue":
      return isLocalId(a.queueId) && typeof a.queueName === "string" ? { kind: "queue", queueName: a.queueName } : undefined;
    case "Cloudflare.Workflow":
      return isLocalId(a.workflowId) && typeof a.workflowName === "string" && typeof a.className === "string" && typeof a.scriptName === "string"
        ? { kind: "workflow", workflowName: a.workflowName, className: a.className, scriptName: a.scriptName }
        : undefined;
    case "Cloudflare.SecretsStore":
    case "Cloudflare.SecretsStore.Secret":
      return isLocalId(a.storeId) ? { kind: "secrets", storeId: a.storeId } : undefined;
    default:
      return undefined;
  }
}

function specKey(spec: BindingSpec) {
  switch(spec.kind) {
    case "queue":
      return `queue:${spec.queueName}`;
    case "workflow":
      return `workflow:${spec.workflowName}`;
    case "secrets":
      return `secrets:${spec.storeId}`;
    default:
      return `${spec.kind}:${spec.id}`;
  }
}

function bindingName(spec: BindingSpec) {
  return specKey(spec).toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

interface Proxy {
  env: Record<string, any>,
  dispose: () => Promise<void>
}

let current: { key: string, proxy: Promise<Proxy> } | undefined;

async function open(ctx: HandlerContext, wanted: BindingSpec[]) {
  const via = { via: "@alchemy.run/cloudflare" };
  const [{ getPlatformProxy }, bindings] = await Promise.all([
    ctx.importFromProject("@alchemy.run/cloudflare-runtime/core/platform-proxy", via),
    ctx.importFromProject("@alchemy.run/cloudflare-runtime/core/bindings", via)
  ]);
  return (await getPlatformProxy({
    name: "alchemy-viz",
    persist: { directory: resolve(ctx.root, ".alchemy", "local") },
    bindings: wanted.map(spec => {
      const binding = bindingName(spec);
      switch(spec.kind) {
        case "kv":
          return bindings.KvNamespace.local({ binding, id: spec.id, mode: spec.instant ? "instant" : undefined });
        case "d1":
          return bindings.D1.local({ binding, id: spec.id });
        case "r2":
          return bindings.R2Bucket.local({ binding, id: spec.id });
        case "queue":
          return bindings.Queue.local({ binding, queueName: spec.queueName });
        case "workflow":
          return bindings.Workflows.local({ binding, workflowName: spec.workflowName, className: spec.className, scriptName: spec.scriptName });
        case "secrets":
          return bindings.SecretsStore.admin({ binding, storeId: spec.storeId });
      }
    })
  })) as Proxy;
}

/**
 * The native binding for a local resource: a KVNamespace, D1Database,
 * R2Bucket, Queue producer, Workflow, or (for Secrets Store) the store's
 * key-value admin surface.
 */
export async function localBinding<T = any>(ctx: HandlerContext, resource: ResourceInfo): Promise<T> {
  const target = localSpec(resource);
  if(!target) {
    throw new Error(`${resource.fqn} isn't running in a local simulator, so it can't be reached here.`);
  }
  const byKey = new Map<string, BindingSpec>();
  for(const r of ctx.stack.resources) {
    const spec = localSpec(r);
    if(spec) byKey.set(specKey(spec), spec);
  }
  const key = [...byKey.keys()].sort().join(",");
  if(!current || current.key !== key) {
    const previous = current;
    const next = { key, proxy: open(ctx, [...byKey.values()]) };
    current = next;
    next.proxy.catch(() => {
      if(current === next) current = undefined;
    });
    previous?.proxy.then(p => p.dispose()).catch(() => {});
  }
  const proxy = await current.proxy;
  return proxy.env[bindingName(target)] as T;
}

export async function disposeLocalRuntime() {
  const p = current;
  current = undefined;
  await p?.proxy.then(x => x.dispose()).catch(() => {});
}
