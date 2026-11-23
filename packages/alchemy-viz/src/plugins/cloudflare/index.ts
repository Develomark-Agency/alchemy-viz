/**
 * `alchemy-viz/cloudflare`: built-in views for Cloudflare resources running
 * under `alchemy dev` (KV, D1, R2, Workers). Resources that only exist in
 * the cloud get a link to the Cloudflare dashboard instead.
 */
import { definePlugin } from "../../index.ts";
import type { ResourceInfo } from "../../types.ts";
import { disposeLocalRuntime, localDataId } from "./runtime.ts";

function file(path: string) {
  return new URL(path, import.meta.url);
}

const DASH = "https://dash.cloudflare.com";

function link(r: ResourceInfo): string | undefined {
  if(!r.type.startsWith("Cloudflare.")) return undefined;
  const a = r.attr ?? {};
  const account = a.accountId;
  if(!account) return undefined;
  switch(r.type) {
    case "Cloudflare.KV.Namespace":
    case "Cloudflare.KV.InstantNamespace":
      return `${DASH}/${account}/workers/kv/namespaces/${a.namespaceId}`;
    case "Cloudflare.D1Database":
    case "Cloudflare.D1.Database":
      return `${DASH}/${account}/workers/d1/databases/${a.databaseId}`;
    case "Cloudflare.R2.Bucket":
      return `${DASH}/${account}/r2/default/buckets/${a.bucketName}`;
    case "Cloudflare.Worker":
      return `${DASH}/${account}/workers/services/view/${a.workerName}/production`;
    default:
      return `${DASH}/${account}`;
  }
}

function isLocal(r: ResourceInfo) {
  if(r.type === "Cloudflare.Worker") {
    const a = r.attr ?? {};
    return r.mode === "local" || String(a.workerId ?? "").startsWith("dev:");
  }
  return localDataId(r) !== undefined;
}

export function cloudflare() {
  return definePlugin({
    name: "cloudflare",
    views: [
      {
        type: ["Cloudflare.KV.Namespace", "Cloudflare.KV.InstantNamespace"],
        title: "Keys",
        server: file("./kv/server.ts"),
        view: file("./kv/view.tsx")
      },
      {
        type: ["Cloudflare.D1Database", "Cloudflare.D1.Database"],
        title: "Data",
        server: file("./d1/server.ts"),
        view: file("./d1/view.tsx")
      },
      {
        type: "Cloudflare.R2.Bucket",
        title: "Objects",
        server: file("./r2/server.ts"),
        view: file("./r2/view.tsx")
      },
      {
        type: "Cloudflare.Worker",
        title: "Worker",
        server: file("./worker/server.ts"),
        view: file("./worker/view.tsx")
      }
    ],
    link,
    isLocal,
    setup: () => disposeLocalRuntime
  });
}
