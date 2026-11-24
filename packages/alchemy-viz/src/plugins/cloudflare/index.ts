/**
 * `alchemy-viz/cloudflare`: built-in views for Cloudflare resources running
 * under `alchemy dev`. Resources that only exist in the cloud, or that
 * have no local view, link to their page in the Cloudflare dashboard.
 */
import { definePlugin } from "../../index.ts";
import type { ResourceInfo } from "../../types.ts";
import { namespacesOf } from "./durable-objects/namespaces.ts";
import { dashboardLink, isLocalResource } from "./links.ts";
import { disposeLocalRuntime, localSpec } from "./runtime.ts";

function file(path: string) {
  return new URL(path, import.meta.url);
}

function bindsSendEmail(worker: ResourceInfo) {
  return worker.bindings.some(b => ((b.data as { bindings?: Array<{ type?: string }> })?.bindings ?? []).some(x => x.type === "send_email"));
}

function isLocal(r: ResourceInfo) {
  // The data views talk to bindings, which need the resource's local id.
  if(localSpec(r) !== undefined) return true;
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
        type: "Cloudflare.Queues.Queue",
        title: "Queue",
        server: file("./queue/server.ts"),
        view: file("./queue/view.tsx")
      },
      {
        type: "Cloudflare.Workflow",
        title: "Instances",
        server: file("./workflow/server.ts"),
        view: file("./workflow/view.tsx")
      },
      {
        type: ["Cloudflare.SecretsStore", "Cloudflare.SecretsStore.Secret"],
        title: "Secrets",
        server: file("./secrets-store/server.ts"),
        view: file("./secrets-store/view.tsx")
      },
      {
        type: ["Cloudflare.Container", "Cloudflare.Containers.DurableObjectApplication"],
        title: "Containers",
        server: file("./container/server.ts"),
        view: file("./container/view.tsx")
      },
      {
        type: "Cloudflare.Worker",
        title: "Durable Objects",
        server: file("./durable-objects/server.ts"),
        view: file("./durable-objects/view.tsx"),
        when: r => namespacesOf(r).length > 0
      },
      {
        type: "Cloudflare.Worker",
        title: "Sent email",
        server: file("./email/server.ts"),
        view: file("./email/view.tsx"),
        when: bindsSendEmail
      }
    ],
    link: dashboardLink,
    isLocal,
    setup: () => disposeLocalRuntime
  });
}
