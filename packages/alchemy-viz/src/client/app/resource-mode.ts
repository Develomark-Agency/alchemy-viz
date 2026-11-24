import type { ResourceInfo } from "../../types.ts";
import { providerOf } from "./providers.tsx";

/**
 * Where a resource runs: `local` in a simulator on this machine, `live` in the cloud, or undefined (shown as
 * unknown) when that can't be told.
 *
 * Alchemy records a mode only for resource types that have both a local and a live provider. Types with a
 * single provider (Vectorize, say, which has no simulator and so always talks to Cloudflare) have none, so
 * without a recorded mode this reads the resource's own ids, then its provider: a known cloud provider
 * means the cloud. A provider of the project's own, whose code may do anything, is left undefined.
 */
export function modeOf(r: ResourceInfo): "local" | "live" | undefined {
  if(r.mode) return r.mode;
  // Local ids (`dev:…`) are what state written before modes were recorded has.
  if(Object.values(r.attr ?? {}).some(v => typeof v === "string" && v.startsWith("dev:"))) return "local";
  const provider = providerOf(r.type);
  return provider && provider.id !== "custom" ? "live" : undefined;
}

export type ModeFilter = "all" | "local" | "live" | "unknown";

/** Whether a resource belongs under a filter; every resource is under exactly one of local, live and unknown. */
export function matchesMode(r: ResourceInfo, filter: ModeFilter) {
  return filter === "all" || (modeOf(r) ?? "unknown") === filter;
}
