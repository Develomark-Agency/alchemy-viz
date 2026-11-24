import { defineServer, requireResource } from "../../../server/define.ts";
import { orgOf, platform, PlatformError } from "../platform.ts";

interface ApiOrg {
  name: string,
  slug: string,
  type: string,
  plan_id?: string,
  overages?: boolean,
  require_mfa?: boolean,
  restore_enabled?: boolean,
  blocked_reads?: boolean,
  blocked_writes?: boolean
}

interface Usage {
  rows_read: number,
  rows_written: number,
  storage_bytes: number,
  databases: number,
  locations: number
}

interface Quotas {
  rowsRead?: number,
  rowsWritten?: number,
  storage?: number,
  databases?: number,
  locations?: number
}

function meter(used: number | undefined, limit: number | undefined) {
  return used === undefined ? undefined : { used, limit };
}

/** A Platform API list that a personal or Starter organization may not have: `undefined` with the reason instead of an error. */
async function optional<T>(run: () => Promise<T>): Promise<{ value?: T, unavailable?: string }> {
  try {
    return { value: await run() };
  } catch (e) {
    if(e instanceof PlatformError && (e.status === 404 || e.status === 403 || e.status === 400)) {
      return { unavailable: e.code === "route_not_found" ? "Not available for this organization." : e.message };
    }
    throw e;
  }
}

/**
 * The organization an `OrganizationSettings`, `OrganizationMember` or
 * `OrganizationInvite` acts on: its settings, plan usage, members and
 * pending invites, with this resource's own entry marked.
 */
export default defineServer({
  organization: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const slug = await orgOf(ctx, r);
    const base = `/organizations/${encodeURIComponent(slug)}`;
    const [{ organization }, subscription, usage, plans, members, invites] = await Promise.all([
      platform<{ organization: ApiOrg }>(ctx, base),
      optional(() => platform<{ subscription: { plan: string, overages: boolean, current_billing_period_start?: string, current_billing_period_end?: string } }>(ctx, `${base}/subscription`)),
      optional(() => platform<{ organization: { usage: Usage } }>(ctx, `${base}/usage`)),
      optional(() => platform<{ plans: Array<{ name: string, quotas: Quotas }> }>(ctx, `${base}/plans`)),
      optional(() => platform<{ members: Array<{ username: string, email?: string, role: string, mfa?: boolean }> }>(ctx, `${base}/members`)),
      optional(() => platform<{ invites: Array<{ email: string, role: string, accepted?: boolean, created_at?: string }> }>(ctx, `${base}/invites`))
    ]);

    const planName = subscription.value?.subscription.plan ?? organization.plan_id;
    const quotas = plans.value?.plans.find(p => p.name === planName)?.quotas;
    const u = usage.value?.organization.usage;

    // What this resource manages, to mark in the lists.
    const a = r.attr ?? {};
    const props = r.props ?? {};
    const managed = r.type === "Turso.OrganizationSettings"
      ? (["overages", "requireMfa", "restoreEnabled"] as const).filter(k => props[k] !== undefined).map(k => ({ key: k, desired: props[k] as boolean, original: (a.original as Record<string, boolean> | undefined)?.[k] }))
      : [];

    return {
      slug: organization.slug,
      name: organization.name,
      type: organization.type,
      plan: planName,
      period: subscription.value && { start: subscription.value.subscription.current_billing_period_start, end: subscription.value.subscription.current_billing_period_end },
      settings: {
        overages: !!organization.overages,
        requireMfa: !!organization.require_mfa,
        restoreEnabled: !!organization.restore_enabled
      },
      blocked: { reads: !!organization.blocked_reads, writes: !!organization.blocked_writes },
      managed,
      usage: u && {
        rowsRead: meter(u.rows_read, quotas?.rowsRead),
        rowsWritten: meter(u.rows_written, quotas?.rowsWritten),
        storage: meter(u.storage_bytes, quotas?.storage),
        databases: meter(u.databases, quotas?.databases),
        locations: meter(u.locations, quotas?.locations)
      },
      members: members.value?.members ?? [],
      membersUnavailable: members.unavailable,
      invites: invites.value?.invites ?? [],
      invitesUnavailable: invites.unavailable,
      self: r.type === "Turso.OrganizationMember"
        ? { kind: "member" as const, id: (a.username ?? props.username) as string }
        : r.type === "Turso.OrganizationInvite"
          ? { kind: "invite" as const, id: (a.email ?? props.email) as string }
          : undefined
    };
  }
});
