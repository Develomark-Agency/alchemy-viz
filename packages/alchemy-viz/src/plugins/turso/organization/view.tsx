import { Mail, User } from "lucide-react";
import type { ReactNode } from "react";
import { defineView } from "../../../client/index.tsx";
import { Badge, cn, EmptyState, ErrorBanner, formatBytes, KeyValueList, Loading, Panel, Status } from "../../../ui/index.ts";
import type server from "./server.ts";

const LABELS = { overages: "Overages", requireMfa: "Require MFA", restoreEnabled: "Restore deleted databases" } as const;

function Meter({ label, used, limit, format = n => n.toLocaleString() }: { label: string, used: number, limit?: number, format?: (n: number) => string }) {
  const share = limit ? Math.min(1, used / limit) : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="tabular-nums">
          {format(used)}
          {limit !== undefined && <span className="text-fg-subtle"> / {format(limit)}</span>}
        </span>
      </div>
      {share !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full", share > 0.9 ? "bg-danger" : share > 0.7 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.max(share * 100, used > 0 ? 1 : 0)}%` }} />
        </div>
      )}
    </div>
  );
}

/** The organization a settings, member or invite resource acts on. */
export default defineView<typeof server>(({ api, resource }) => {
  const org = api.organization.useQuery(undefined, { retry: false });
  const o = org.data;

  if(org.error) return <ErrorBanner error={org.error} />;
  if(!o) return <Loading />;

  const managedKeys = new Set(o.managed.map(m => m.key));
  const settings: Array<[ReactNode, ReactNode]> = (Object.keys(LABELS) as Array<keyof typeof LABELS>).map(key => {
    const m = o.managed.find(x => x.key === key);
    const value = o.settings[key];
    return [LABELS[key], (
      <span key={key} className="flex flex-wrap items-center gap-2">
        <Status tone={value ? "ok" : "neutral"}>{value ? "On" : "Off"}</Status>
        {m && (m.desired === value
          ? <Badge tone="accent">Managed here</Badge>
          : <Badge tone="warn">Drifted: stack wants {m.desired ? "on" : "off"}</Badge>)}
        {m && m.original !== undefined && <span className="text-xs text-fg-subtle">Restored to {m.original ? "on" : "off"} on destroy</span>}
      </span>
    )];
  });

  const u = o.usage;
  const sectionOrder = resource.type === "Turso.OrganizationSettings" ? ["settings", "usage", "members"] : ["members", "settings", "usage"];
  const sections: Record<string, ReactNode> = {
    settings: (
      <Panel key="settings" title="Settings">
        <div className="flex flex-col gap-3">
          <KeyValueList items={settings} />
          {(o.blocked.reads || o.blocked.writes) && <ErrorBanner error={`Turso has blocked ${o.blocked.reads && o.blocked.writes ? "reads and writes" : o.blocked.reads ? "reads" : "writes"} for this organization.`} />}
          {managedKeys.size === 0 && resource.type === "Turso.OrganizationSettings" && <p className="text-xs text-fg-subtle">This resource sets none of these, so it manages nothing.</p>}
        </div>
      </Panel>
    ),
    usage: u && (
      <Panel
        key="usage"
        title={<>Usage <span className="font-normal text-fg-subtle">this billing period</span></>}
        actions={o.period?.end && <span className="text-xs text-fg-subtle">Resets {new Date(o.period.end).toLocaleDateString()}</span>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {u.rowsRead && <Meter label="Rows read" {...u.rowsRead} />}
          {u.rowsWritten && <Meter label="Rows written" {...u.rowsWritten} />}
          {u.storage && <Meter label="Storage" {...u.storage} format={formatBytes} />}
          {u.databases && <Meter label="Databases" {...u.databases} />}
          {u.locations && <Meter label="Locations" {...u.locations} />}
        </div>
      </Panel>
    ),
    members: (
      <Panel key="members" title={<>Members <span className="font-normal text-fg-subtle tabular-nums">{o.members.length + o.invites.length}</span></>} flush>
        {o.membersUnavailable && o.members.length === 0
          ? <EmptyState title="Members aren't available">{o.membersUnavailable}</EmptyState>
          : (
            <ul className="divide-y divide-line">
              {o.members.map(m => (
                <li key={m.username} className={cn("flex items-center gap-3 px-4 py-2.5", o.self?.kind === "member" && o.self.id === m.username && "bg-accent-soft/50")}>
                  <User className="size-3.5 shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{m.username}</div>
                    {m.email && <div className="truncate text-xs text-fg-subtle">{m.email}</div>}
                  </div>
                  {o.self?.kind === "member" && o.self.id === m.username && <Badge tone="accent">This resource</Badge>}
                  {m.mfa && <Badge>MFA</Badge>}
                  <Badge tone={m.role === "owner" || m.role === "admin" ? "info" : "neutral"}>{m.role}</Badge>
                </li>
              ))}
              {o.invites.map(i => (
                <li key={i.email} className={cn("flex items-center gap-3 px-4 py-2.5", o.self?.kind === "invite" && o.self.id === i.email && "bg-accent-soft/50")}>
                  <Mail className="size-3.5 shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1 truncate text-[13px]">{i.email}</div>
                  {o.self?.kind === "invite" && o.self.id === i.email && <Badge tone="accent">This resource</Badge>}
                  <Badge tone="warn">{i.accepted ? "Accepted" : "Invited"}</Badge>
                  <Badge>{i.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        {o.invitesUnavailable && o.type === "personal" && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-fg-subtle">Personal organizations can't invite members. Members and invites need a team organization on a paid plan.</p>
        )}
      </Panel>
    )
  };

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <Panel title="Organization">
        <KeyValueList
          items={[
            ["Slug", <span key="s" className="font-mono text-xs">{o.slug}</span>],
            ["Type", <span key="t" className="first-letter:uppercase">{o.type}</span>],
            ["Plan", o.plan && <Badge key="p" tone="accent">{o.plan}</Badge>]
          ]}
        />
      </Panel>
      {sectionOrder.map(s => sections[s])}
    </div>
  );
});
