import { defineServer, requireResource } from "../../../server/define.ts";
import { orgOf, platform } from "../platform.ts";

interface ApiGroup {
  name: string,
  uuid: string,
  primary?: string,
  locations?: string[],
  version?: string,
  archived?: boolean,
  delete_protection?: boolean,
  status?: { locations?: Array<{ name: string, status: string }> }
}

interface ApiDatabase {
  Name: string,
  DbId: string,
  Hostname: string,
  primaryRegion?: string,
  regions?: string[],
  sleeping?: boolean,
  archived?: boolean,
  block_reads?: boolean,
  block_writes?: boolean,
  delete_protection?: boolean
}

/** A Turso group as the Platform API reports it now, and every database in it. */
export default defineServer({
  group: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const name = r.attr?.name as string | undefined;
    if(!name) throw new Error("This group has no name yet. It appears once the group is created.");
    const org = await orgOf(ctx, r);
    const base = `/organizations/${encodeURIComponent(org)}`;
    const [{ group }, { databases }] = await Promise.all([
      platform<{ group: ApiGroup }>(ctx, `${base}/groups/${encodeURIComponent(name)}`),
      platform<{ databases: ApiDatabase[] }>(ctx, `${base}/databases?group=${encodeURIComponent(name)}`)
    ]);
    const inStack = new Map(ctx.stack.resources.filter(x => x.type === "Turso.Database").map(x => [x.attr?.name as string, x.fqn]));
    const status = new Map((group.status?.locations ?? []).map(l => [l.name, l.status]));
    return {
      organization: org,
      primary: group.primary,
      version: group.version || undefined,
      archived: !!group.archived,
      deleteProtection: !!group.delete_protection,
      locations: (group.locations ?? []).map(l => ({ name: l, primary: l === group.primary, status: status.get(l) })),
      tokens: ctx.stack.resources.filter(x => (x.type === "Turso.GroupToken" || x.type === "Turso.ApiToken") && x.attr?.group === name).map(x => x.fqn),
      databases: (databases ?? []).map(d => ({
        name: d.Name,
        id: d.DbId,
        hostname: d.Hostname,
        region: d.primaryRegion,
        sleeping: !!d.sleeping,
        archived: !!d.archived,
        blocked: !!(d.block_reads || d.block_writes),
        deleteProtection: !!d.delete_protection,
        fqn: inStack.get(d.Name)
      }))
    };
  }
});
