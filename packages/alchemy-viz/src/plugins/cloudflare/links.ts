/**
 * Links from a Cloudflare resource to its page in the Cloudflare dashboard.
 *
 * Resources with a page of their own get a deep link when their attributes
 * carry the id it needs. Everything else lands on its product's page in the
 * account, and failing that on the account itself, so a deployed resource
 * always links somewhere useful.
 */
import type { ResourceInfo } from "../../types.ts";

const DASH = "https://dash.cloudflare.com";

type Attr = Record<string, unknown>;

function str(value: unknown) {
  return typeof value === "string" && value && !value.startsWith("dev:") ? encodeURIComponent(value) : undefined;
}

function path(...parts: Array<string | undefined>) {
  return parts.some(p => p === undefined) ? undefined : parts.join("/");
}

/** Deep links, by exact type. Each returns a path under the account, or undefined when an id is missing. */
const pages: Record<string, (a: Attr) => string | undefined> = {
  "Cloudflare.Worker": a => path("workers/services/view", str(a.workerName), "production"),
  "Cloudflare.KV.Namespace": a => path("workers/kv/namespaces", str(a.namespaceId)),
  "Cloudflare.KV.InstantNamespace": a => path("workers/kv/namespaces", str(a.namespaceId)),
  "Cloudflare.D1Database": a => path("workers/d1/databases", str(a.databaseId)),
  "Cloudflare.D1.Database": a => path("workers/d1/databases", str(a.databaseId)),
  "Cloudflare.R2.Bucket": a => path("r2/default/buckets", str(a.bucketName)),
  "Cloudflare.Queues.Queue": a => path("workers/queues/view", str(a.queueId)),
  "Cloudflare.Queues.Consumer": a => path("workers/queues/view", str(a.queueId)),
  "Cloudflare.Workflow": a => path("workers/workflows", str(a.workflowName)),
  "Cloudflare.Pages.Project": a => path("pages/view", str(a.name ?? a.projectName)),
  "Cloudflare.VectorizeIndex": a => path("ai/vectorize", str(a.indexName)),
  "Cloudflare.Vectorize.SearchIndex": a => path("ai/vectorize", str(a.indexName)),
  "Cloudflare.AI.Gateway": a => path("ai/ai-gateway", str(a.gatewayId)),
  "Cloudflare.Zone": a => str(a.name ?? a.zoneName),
  "Cloudflare.Zone.Zone": a => str(a.name ?? a.zoneName)
};

/** A product's page in the account, by type prefix. Checked in order, so longer prefixes first. */
const sections: Array<[prefix: string, path: string]> = [
  ["Cloudflare.Queues.", "workers/queues"],
  ["Cloudflare.Queue", "workers/queues"],
  ["Cloudflare.Workflow", "workers/workflows"],
  ["Cloudflare.Workers.", "workers-and-pages"],
  ["Cloudflare.Worker", "workers-and-pages"],
  ["Cloudflare.DurableObject", "workers/durable-objects"],
  ["Cloudflare.Container", "workers/containers"],
  ["Cloudflare.KV", "workers/kv/namespaces"],
  ["Cloudflare.D1", "workers/d1"],
  ["Cloudflare.R2", "r2/overview"],
  ["Cloudflare.Hyperdrive", "workers/hyperdrive"],
  ["Cloudflare.SecretsStore", "secrets-store"],
  ["Cloudflare.Vectorize", "ai/vectorize"],
  ["Cloudflare.AI.Gateway", "ai/ai-gateway"],
  ["Cloudflare.AiGateway", "ai/ai-gateway"],
  ["Cloudflare.AI.Search", "ai/ai-search"],
  ["Cloudflare.AiSearch", "ai/ai-search"],
  ["Cloudflare.AI", "ai/workers-ai"],
  ["Cloudflare.Pipelines", "pipelines"],
  ["Cloudflare.Pages", "workers-and-pages"],
  ["Cloudflare.Images", "images"],
  ["Cloudflare.Stream", "stream"],
  ["Cloudflare.Turnstile", "turnstile"],
  ["Cloudflare.Registrar", "domains"],
  ["Cloudflare.Zone", ""],
  ["Cloudflare.ApiToken", "api-tokens"]
];

export function dashboardLink(r: ResourceInfo): string | undefined {
  if(!r.type.startsWith("Cloudflare.")) return undefined;
  const a: Attr = r.attr ?? {};
  const account = str(a.accountId);
  if(!account) return undefined;
  const page = pages[r.type]?.(a) ?? sections.find(([prefix]) => r.type.startsWith(prefix))?.[1];
  return page ? `${DASH}/${account}/${page}` : `${DASH}/${account}`;
}

/**
 * Whether the resource runs in `alchemy dev`'s local simulators rather than
 * in the cloud. Alchemy records the provider mode in state; local ids
 * (`dev:…`) are a fallback for state written before it did.
 */
export function isLocalResource(r: ResourceInfo) {
  if(r.mode) return r.mode === "local";
  return Object.values(r.attr ?? {}).some(v => typeof v === "string" && v.startsWith("dev:"));
}
