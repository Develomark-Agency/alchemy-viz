import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo } from "../../types.ts";
import { Badge, EmptyState, ExternalLinkCard, JsonInspector, LinkButton, Page, Panel, StatusPill, Tabs, TabsList, TabsPanel, TabsTab } from "../../ui/index.ts";
import { LogsPanel } from "./logs-panel.tsx";
import { ViewHost } from "./plugin-host.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { resourceRoute } from "./router.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

function providerName(type: string) {
  return type.split(".")[0];
}

function Connections({ resource, resources }: { resource: ResourceInfo, resources: ResourceInfo[] }) {
  const typeOf = new Map(resources.map(r => [r.fqn, r.type]));
  function list(fqns: string[]) {
    if(fqns.length === 0) return <span className="text-fg-subtle">None</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {fqns.map(f => (
          <Link key={f} to="/r/$fqn" params={{ fqn: f }} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-surface-2 pr-2 pl-1 text-xs font-medium hover:border-line-strong">
            <ResourceIcon type={typeOf.get(f) ?? f} size={16} />
            {f}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-6 gap-y-3 text-[13px]">
      <dt className="pt-0.5 text-fg-muted">Depends on</dt>
      <dd>{list(resource.upstream)}</dd>
      <dt className="pt-0.5 text-fg-muted">Used by</dt>
      <dd>{list(resource.downstream)}</dd>
    </dl>
  );
}

function Details({ resource, resources }: { resource: ResourceInfo, resources: ResourceInfo[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Connections">
        <Connections resource={resource} resources={resources} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Attributes">
          <JsonInspector value={resource.attr} label="Attributes" />
        </Panel>
        <Panel title="Props">
          <JsonInspector value={resource.props} label="Props" />
        </Panel>
      </div>
      {resource.bindings.length > 0 && (
        <Panel title="Bindings">
          <JsonInspector value={resource.bindings} label="Bindings" openDepth={1} />
        </Panel>
      )}
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
          <ResourceIcon type={resource.type} size={26} />
          {resource.logicalId}
        </span>
      }
      subtitle={
        <span title={resource.type}>
          {label.provider ? `${label.provider} ${label.name}` : label.name}
          {resource.fqn !== resource.logicalId && <span className="text-fg-subtle"> · {resource.fqn}</span>}
        </span>
      }
      badges={(
        <>
          <StatusPill status={resource.status} />
          {resource.mode === "local" && <Badge tone="info">local</Badge>}
          {resource.mode === "live" && <Badge tone="warn">cloud</Badge>}
        </>
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
