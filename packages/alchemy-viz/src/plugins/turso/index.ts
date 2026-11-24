/**
 * `alchemy-viz/turso`: views for every `@alchemy.run/turso` resource.
 *
 * Turso runs in the cloud, so these views talk to it directly: the Platform
 * API with the project's Turso credentials (`TURSO_API_TOKEN`, or the
 * Alchemy profile), and each database's SQL endpoint with a short-lived
 * token. A `Turso.Database` served by a libSQL server on this machine (from
 * a local provider) is queried there instead, with no token.
 */
import { definePlugin } from "../../index.ts";
import type { ResourceInfo } from "../../types.ts";

/**
 * A module next to this one. Built, every `.ts`/`.tsx` file is a `.mjs`
 * beside its source's place, so the reference follows.
 */
function file(path: string) {
  return new URL(import.meta.url.endsWith(".mjs") ? path.replace(/\.tsx?$/, ".mjs") : path, import.meta.url);
}

const APP = "https://app.turso.tech";

/** The resource's page in the Turso dashboard, or the organization's when it has none of its own. */
function tursoLink(r: ResourceInfo): string | undefined {
  if(!r.type.startsWith("Turso.")) return undefined;
  const a = r.attr ?? {};
  const org = typeof a.organization === "string" && a.organization ? encodeURIComponent(a.organization) : undefined;
  if(!org) return undefined;
  if(r.type === "Turso.Database" && typeof a.name === "string" && !String(a.url ?? "").startsWith("http://")) {
    return `${APP}/${org}/databases/${encodeURIComponent(a.name)}`;
  }
  if(r.type === "Turso.Group" || r.type === "Turso.Database") return `${APP}/${org}/databases`;
  if(r.type.startsWith("Turso.Organization")) return `${APP}/${org}/settings`;
  return `${APP}/${org}`;
}

export function turso() {
  return definePlugin({
    name: "turso",
    views: [
      {
        type: "Turso.Database",
        title: "Data",
        server: file("./database/server.ts"),
        view: file("./database/view.tsx")
      },
      {
        type: "Turso.Group",
        title: "Databases",
        server: file("./group/server.ts"),
        view: file("./group/view.tsx")
      },
      {
        type: ["Turso.DatabaseToken", "Turso.GroupToken", "Turso.ApiToken"],
        title: "Token",
        server: file("./token/server.ts"),
        view: file("./token/view.tsx")
      },
      {
        type: ["Turso.OrganizationSettings", "Turso.OrganizationMember", "Turso.OrganizationInvite"],
        title: "Organization",
        server: file("./organization/server.ts"),
        view: file("./organization/view.tsx")
      }
    ],
    link: tursoLink,
    // The views reach Turso Cloud themselves, so they work for cloud resources too.
    isLocal: () => true
  });
}
