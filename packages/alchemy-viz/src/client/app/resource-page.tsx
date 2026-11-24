import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo } from "../../types.ts";
import { Banner, cn, EmptyState, ErrorBanner, ExternalLinkCard, LinkButton, Page, Panel, PropertyList, type PropertySection, PropertyValue, RunsOn, StatusText, Tabs, TabsList, TabsPanel, TabsTab, toProperties } from "../../ui/index.ts";
import { LogsPanel } from "./logs-panel.tsx";
import { ViewHost } from "./plugin-host.tsx";
import { ProviderTip } from "./providers.tsx";
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
/**
 * Why a resource failed. One that inherited a dependency's failure says so
 * and traces the chain back to the resource whose own apply broke, which
 * is where the error belongs.
 */
function FailureTrace({ resource, resources }: { resource: ResourceInfo, resources: ResourceInfo[] }) {
  const byFqn = new Map(resources.map(r => [r.fqn, r]));
  const chain = [resource];
  for(let r: ResourceInfo | undefined = resource; r?.failedBy && chain.length < 50;) {
    r = byFqn.get(r.failedBy);
    if(r) chain.unshift(r);
  }
  if(chain.length === 1) return <ErrorBanner error={`Failed to apply: ${resource.error}`} className="mb-4" />;
  return (
    <Banner tone="danger" className="mb-4">
      <div className="font-medium">
        Not applied because {byFqn.get(resource.failedBy!)?.logicalId ?? resource.failedBy} failed
      </div>
      <ol className="mt-3 flex flex-col">
        {chain.map((r, i) => {
          const last = i === chain.length - 1;
          return (
            <li key={r.fqn} className="flex gap-3">
              {/*
                The marker column stretches to the row's height. The dot is centred in a
                line-height box, and the connector runs from this dot's edge to the next
                dot's edge (the spacing sits in the text column, so the marker column spans the whole row). Every size here is in rem (the dashboard scales its root font),
                so the offsets stay exact: dot radius is 1.25 units, half a row box is 2.5.
              */}
              <div className="relative w-2.5 shrink-0">
                <div className="flex h-5 items-center">
                  <span className={cn("size-2.5 rounded-full border-[1.5px] border-danger", i === 0 ? "bg-danger" : "bg-danger-soft")} />
                </div>
                {!last && <span className="absolute top-3.75 -bottom-1.25 left-1/2 w-0.5 -translate-x-1/2 bg-danger/40" />}
              </div>
              <div className={cn("min-w-0 leading-5", !last && "pb-3.5")}>
                {last
                  ? <span className="font-medium">{r.logicalId} <span className="font-normal opacity-70">(this resource)</span></span>
                  : <Link to="/r/$fqn" params={{ fqn: r.fqn }} className="font-medium underline underline-offset-2">{r.logicalId}</Link>}
                <div className="opacity-80">
                  {i === 0 ? r.error : `Blocked because ${chain[i - 1]!.logicalId} failed`}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Banner>
  );
}

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
  const resourceViews = (meta?.viewIds ?? []).flatMap(id => views.filter(v => v.id === id));
  const tabs = [...resourceViews.map(v => v.title), "Details", "Logs"].map(t => t.toLowerCase());
  const active = tab && tabs.includes(tab) ? tab : tabs[0]!;
  const label = typeLabel(resource.type);

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <ProviderTip type={resource.type} render={<span className="inline-flex" />}>
            <ResourceIcon type={resource.type} size={30} />
          </ProviderTip>
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
      {resource.error && <FailureTrace resource={resource} resources={data.stack.resources} />}
      <Tabs
        value={active}
        // Keep the view's own URL state (D1's open console, a selected key)
        // so switching tabs never resets the panel that's leaving.
        onValueChange={next => next && navigate({ to: "/r/$fqn", params: { fqn }, search: prev => ({ ...prev, tab: next }), replace: true })}
      >
        <TabsList aria-label="Resource">
          {resourceViews.map(v => <TabsTab key={v.id} value={v.title.toLowerCase()}>{v.title}</TabsTab>)}
          <TabsTab value="details">Details</TabsTab>
          <TabsTab value="logs">Logs</TabsTab>
        </TabsList>
        {resourceViews.map(view => (
          <TabsPanel key={view.id} value={view.title.toLowerCase()}>
            {meta?.local === false
              ? (
                <ExternalLinkCard href={meta.link} provider={providerName(resource.type)}>
                  {resource.logicalId} runs in the cloud, not in a local simulator, so its data can't be shown here.
                </ExternalLinkCard>
              )
              : <ViewHost viewId={view.id} resource={resource} stack={data.stack} />}
          </TabsPanel>
        ))}
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
