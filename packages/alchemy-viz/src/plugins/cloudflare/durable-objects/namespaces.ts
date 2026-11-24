import type { ResourceInfo } from "../../../types.ts";

/** Durable Object classes this Worker hosts, from its state: class name → local namespace id. */
export function namespacesOf(worker: ResourceInfo): Array<{ className: string, namespaceId: string }> {
  const ns = worker.attr?.durableObjectNamespaces;
  if(!ns || typeof ns !== "object") return [];
  return Object.entries(ns as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === "string")
    .map(([className, namespaceId]) => ({ className, namespaceId }));
}
