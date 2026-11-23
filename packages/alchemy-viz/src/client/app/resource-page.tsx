import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo } from "../../types.ts";
import { EmptyState, ExternalLinkCard, LinkButton, Page, Panel, PropertyList, type PropertySection, PropertyValue, RunsOn, StatusText, Tabs, TabsList, TabsPanel, TabsTab, toProperties } from "../../ui/index.ts";
import { LogsPanel } from "./logs-panel.tsx";
import { ViewHost } from "./plugin-host.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { resourceRoute } from "./router.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

function providerName(type: string) {
  return type.split(".")[0];
}

/** A link to another resource in the stack, as a compact chip. */
function ResourceChip({ fqn, type }: { fqn: string, type: string }) {
  return (
    <Link
      to="/r/$fqn"
      params={{ fqn }}
      title={typeLabel(type).name}
      className="group/chip inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface pr-1.5 pl-0.5 text-[13px] font-medium transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong hover:bg-hover/60"
    >
      <ResourceIcon type={type} size={20} className="border-0 bg-transparent" />
      <span className="truncate">{fqn}</span>
      <ArrowRight className="size-3 shrink-0 -translate-x-0.5 text-fg-subtle opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover/chip:translate-x-0 group-hover/chip:opacity-100" />
    </Link>
  );
}

function Chips({ fqns, typeOf }: { fqns: string[], typeOf: Map<string, string> }) {
  if(fqns.length === 0) return <span className="text-fg-subtle">None</span>;
  return <span className="flex flex-wrap gap-1.5">{fqns.map(f => <ResourceChip key={f} fqn={f} type={typeOf.get(f) ?? ""} />)}</span>;
}

/** The resource a binding points at, found by matching its ids against other resources' attributes. */
function bindingTarget(data: unknown, self: string, resources: ResourceInfo[]) {
  const ids = new Set<string>();
  JSON.stringify(data, (_, v) => {
    if(typeof v === "string" && v.length >= 6) ids.add(v);
    return v;
  });
  return resources.find(r => r.fqn !== self && Object.values(r.attr ?? {}).some(v => typeof v === "string" && ids.has(v)));
}

/**
 * The resource's state as one property sheet. Every section shares the key
 * column, so it reads as a single document instead of cards of different
 * sizes. The header above already says type, status and where it runs.
 */
function Details({ resource, resources }: { resource: ResourceInfo, resources: ResourceInfo[] }) {
  const typeOf = new Map(resources.map(r => [r.fqn, r.type]));
  const sections: PropertySection[] = [
    { title: "Attributes", items: toProperties(resource.attr), empty: "No attributes yet. They appear once the resource is created." },
    { title: "Props", items: toProperties(resource.props), empty: "No props" }
  ];
  if(resource.bindings.length > 0) {
    sections.push({
      title: "Bindings",
      items: resource.bindings.map(b => {
        const target = bindingTarget(b.data, resource.fqn, resources);
        return {
          key: b.sid,
          value: b.data,
          display: target && (
            <span className="flex flex-col items-start gap-1.5">
              <ResourceChip fqn={target.fqn} type={target.type} />
              <PropertyValue value={b.data} />
            </span>
          )
        };
      })
    });
  }
  sections.push({
    title: "Connections",
    count: false,
    items: [
      { key: "Depends on", value: resource.upstream, display: <Chips fqns={resource.upstream} typeOf={typeOf} /> },
      { key: "Used by", value: resource.downstream, display: <Chips fqns={resource.downstream} typeOf={typeOf} /> }
    ]
  });
  return (
    <Panel flush className="max-w-[880px]">
      <PropertyList sections={sections} />
    </Panel>
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
        // Keep the view's own URL state (D1's open console, a selected key)
        // so switching tabs never resets the panel that's leaving.
        onValueChange={next => next && navigate({ to: "/r/$fqn", params: { fqn }, search: prev => ({ ...prev, tab: next }), replace: true })}
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
