import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo } from "../../types.ts";
import { EmptyState, ExternalLinkCard, JsonInspector, LinkButton, Page, Panel, RunsOn, StatusText, Tabs, TabsList, TabsPanel, TabsTab } from "../../ui/index.ts";
import { LogsPanel } from "./logs-panel.tsx";
import { ViewHost } from "./plugin-host.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { resourceRoute } from "./router.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

function providerName(type: string) {
  return type.split(".")[0];
}

function ConnectionList({ title, fqns, typeOf }: { title: string, fqns: string[], typeOf: Map<string, string> }) {
  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-1.5 text-xs text-fg-muted">{title}</div>
      {fqns.length === 0
        ? <div className="px-4 pb-3 text-[13px] text-fg-subtle">None</div>
        : (
          <ul className="pb-1.5">
            {fqns.map(f => (
              <li key={f}>
                <Link to="/r/$fqn" params={{ fqn: f }} className="group flex items-center gap-2.5 px-4 py-1.5 text-[13px] transition-colors duration-150 ease-out hover:bg-hover">
                  <ResourceIcon type={typeOf.get(f) ?? f} size={22} />
                  <span className="min-w-0 flex-1 truncate font-medium">{f}</span>
                  <span className="truncate text-xs text-fg-subtle">{typeLabel(typeOf.get(f) ?? "").name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function Details({ resource, resources }: { resource: ResourceInfo, resources: ResourceInfo[] }) {
  const typeOf = new Map(resources.map(r => [r.fqn, r.type]));
  const label = typeLabel(resource.type);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Attributes">
          <JsonInspector value={resource.attr} label="Attributes" />
        </Panel>
        <Panel title="Props">
          <JsonInspector value={resource.props} label="Props" />
        </Panel>
        {resource.bindings.length > 0 && (
          <Panel title="Bindings">
            <JsonInspector value={resource.bindings} label="Bindings" openDepth={1} />
          </Panel>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+16px)]">
        <Panel title="Summary" flush>
          <dl className="divide-y divide-line text-[13px]">
            {([
              ["Type", <span title={resource.type}>{label.provider ? `${label.provider} ${label.name}` : label.name}</span>],
              ["Logical ID", <span className="font-mono text-xs">{resource.logicalId}</span>],
              ...(resource.fqn !== resource.logicalId ? [["FQN", <span className="font-mono text-xs break-all">{resource.fqn}</span>] as const] : []),
              ["Status", <StatusText status={resource.status} />],
              ["Runs", <RunsOn mode={resource.mode} />]
            ] as Array<readonly [string, ReactNode]>).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-xs text-fg-muted">{k}</dt>
                <dd className="min-w-0 text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Connections" flush bodyClassName="divide-y divide-line">
          <ConnectionList title="Depends on" fqns={resource.upstream} typeOf={typeOf} />
          <ConnectionList title="Used by" fqns={resource.downstream} typeOf={typeOf} />
        </Panel>
      </div>
    </div>
  );
}

export function ResourcePage() {
  const { fqn } = resourceRoute.useParams();
  const { tab } = resourceRoute.useSearch();
  const navigate = useNavigate();
  const data = useStack().data!;
  const resource = data.stack.resources.find(r => r.fqn === fqn);

  if(!resource) {
    return (
      <Panel>
        <EmptyState title={`No resource '${fqn}' in ${data.stack.stage}`}>It may have been deleted, or it lives in another stage.</EmptyState>
      </Panel>
    );
  }

  const meta = data.meta[fqn];
  const view = meta?.viewId ? views.find(v => v.id === meta.viewId) : undefined;
  const tabs = [...(view ? [view.title] : []), "Details", "Logs"].map(t => t.toLowerCase());
  const active = tab && tabs.includes(tab) ? tab : tabs[0]!;
  const label = typeLabel(resource.type);

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <ResourceIcon type={resource.type} size={30} />
          {resource.logicalId}
        </span>
      }
      subtitle={(
        <span className="flex flex-wrap items-center gap-x-2">
          <span title={resource.type}>{label.provider ? `${label.provider} ${label.name}` : label.name}</span>
          {resource.fqn !== resource.logicalId && <span className="font-mono text-xs text-fg-subtle">{resource.fqn}</span>}
          <span className="text-line-strong">/</span>
          <RunsOn mode={resource.mode} />
          <span className="text-line-strong">/</span>
          <StatusText status={resource.status} />
        </span>
      )}
      actions={meta?.link && resource.mode !== "local" && (
        <LinkButton href={meta.link}>
          Open in {providerName(resource.type)}
          <ArrowRight />
        </LinkButton>
      )}
    >
      <Tabs
        value={active}
        onValueChange={next => next && navigate({ to: "/r/$fqn", params: { fqn }, search: { tab: next }, replace: true })}
      >
        <TabsList aria-label="Resource">
          {view && <TabsTab value={view.title.toLowerCase()}>{view.title}</TabsTab>}
          <TabsTab value="details">Details</TabsTab>
          <TabsTab value="logs">Logs</TabsTab>
        </TabsList>
        {view && (
          <TabsPanel value={view.title.toLowerCase()}>
            {meta?.local === false
              ? (
                <ExternalLinkCard href={meta.link} provider={providerName(resource.type)}>
                  {resource.logicalId} runs in the cloud, not in a local simulator, so its data can't be shown here.
                </ExternalLinkCard>
              )
              : <ViewHost viewId={view.id} resource={resource} stack={data.stack} />}
          </TabsPanel>
        )}
        <TabsPanel value="details">
          <Details resource={resource} resources={data.stack.resources} />
        </TabsPanel>
        <TabsPanel value="logs">
          <Panel flush>
            <LogsPanel fqn={resource.fqn} />
          </Panel>
        </TabsPanel>
      </Tabs>
    </Page>
  );
}
