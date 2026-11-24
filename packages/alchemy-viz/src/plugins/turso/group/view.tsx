import { Database, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { defineView, ResourceLink } from "../../../client/index.tsx";
import { Badge, cn, EmptyState, ErrorBanner, IconButton, KeyValueList, Loading, Panel, Status } from "../../../ui/index.ts";
import type server from "./server.ts";

/** The group's locations and every database it holds, including ones this stack doesn't manage. */
export default defineView<typeof server>(({ api }) => {
  const group = api.group.useQuery(undefined, { retry: false });
  const g = group.data;

  if(group.error) return <ErrorBanner error={group.error} />;
  if(!g) return <Loading />;

  const items: Array<[ReactNode, ReactNode]> = [
    ["Locations", (
      <span key="l" className="flex flex-col gap-1">
        {g.locations.map(l => (
          <span key={l.name} className="flex items-center gap-3">
            <span className="font-mono text-xs">{l.name}</span>
            {l.status && <Status tone={l.status === "up" ? "ok" : "warn"}>{l.status}</Status>}
            {l.primary && g.locations.length > 1 && <Badge>Primary</Badge>}
          </span>
        ))}
      </span>
    )],
    ["Organization", <span key="o" className="font-mono text-xs">{g.organization}</span>]
  ];
  if(g.version) items.push(["libSQL version", <span key="v" className="font-mono text-xs">{g.version}</span>]);
  if(g.archived || g.deleteProtection) {
    items.push(["Settings", (
      <span key="s" className="flex gap-1.5">
        {g.archived && <Badge tone="warn">Archived</Badge>}
        {g.deleteProtection && <Badge tone="info">Delete protection</Badge>}
      </span>
    )]);
  }
  if(g.tokens.length) {
    items.push(["Tokens", <span key="t" className="flex flex-wrap gap-2">{g.tokens.map(fqn => <ResourceLink key={fqn} fqn={fqn} className="font-mono text-xs hover:underline" />)}</span>]);
  }

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <Panel title="Group">
        <KeyValueList items={items} />
      </Panel>
      <Panel
        title={<>Databases <span className="font-normal text-fg-subtle tabular-nums">{g.databases.length}</span></>}
        actions={(
          <IconButton label="Refresh" onClick={() => group.refetch()}>
            <RefreshCw className={cn(group.isRefetching && "animate-spin")} />
          </IconButton>
        )}
        flush
      >
        {g.databases.length === 0
          ? <EmptyState title="No databases">Declare a Turso.Database with this group, or create one with the Turso CLI.</EmptyState>
          : (
            <ul className="divide-y divide-line">
              {g.databases.map(d => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Database className="size-3.5 shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    {d.fqn
                      ? <ResourceLink fqn={d.fqn} className="text-[13px] font-medium hover:underline" />
                      : <span className="text-[13px] font-medium">{d.name}</span>}
                    <div className="truncate font-mono text-xs text-fg-subtle">{d.hostname}</div>
                  </div>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {!d.fqn && <Badge>Not in this stack</Badge>}
                    {d.sleeping && <Badge tone="info">Sleeping</Badge>}
                    {d.archived && <Badge tone="warn">Archived</Badge>}
                    {d.blocked && <Badge tone="warn">Blocked</Badge>}
                    {d.region && <Badge>{d.region}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
});
