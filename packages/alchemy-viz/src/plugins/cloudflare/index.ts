/**
 * `alchemy-viz/cloudflare`: built-in views for Cloudflare resources running
 * under `alchemy dev`. Resources that only exist in the cloud, or that
 * have no local view, link to their page in the Cloudflare dashboard.
 */
import { definePlugin } from "../../index.ts";
import type { ResourceInfo } from "../../types.ts";
import { namespacesOf } from "./durable-objects/namespaces.ts";
import { dashboardLink, isLocalResource } from "./links.ts";
import { disposeLocalRuntime, localDataId } from "./runtime.ts";

function file(path: string) {
  return new URL(path, import.meta.url);
}

function isLocal(r: ResourceInfo) {
  // The data views talk to bindings, which need the resource's local id.
  if(localDataId(r) !== undefined) return true;
  return isLocalResource(r);
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
      },
      {
        type: "Cloudflare.Worker",
        title: "Durable Objects",
        server: file("./durable-objects/server.ts"),
        view: file("./durable-objects/view.tsx"),
        when: r => namespacesOf(r).length > 0
      }
    ],
    link: dashboardLink,
    isLocal,
    setup: () => disposeLocalRuntime
  });
}
