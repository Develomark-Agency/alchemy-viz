import type { ResourceInfo, StackInfo } from "../../types.ts";
import { Badge, EmptyState, ExternalLinkCard, JsonInspector, LinkButton, Page, Panel, Stack, StatusPill, Tabs } from "../../ui/index.ts";
import { ResourceLink } from "../index.tsx";
import { views } from "virtual:alchemy-viz/registry";
import { LogsPanel } from "./logs-panel.tsx";
import { ViewHost } from "./plugin-host.tsx";
import { typeLabel } from "./type-label.ts";
import type { ResourceMeta } from "./use-stack.ts";

function providerName(type: string) {
  return type.split(".")[0];
}

function Connections({ resource }: { resource: ResourceInfo }) {
  function list(fqns: string[]) {
    return fqns.length ? (
      <div className="av-row" style={{ gap: 6 }}>
        {fqns.map(f => (
          <ResourceLink key={f} fqn={f} className="av-badge" />
        ))}
      </div>
    ) : (
      <span className="av-muted">None</span>
    );
  }
  return (
    <dl className="av-kv">
      <dt>Depends on</dt>
      <dd>{list(resource.upstream)}</dd>
      <dt>Used by</dt>
      <dd>{list(resource.downstream)}</dd>
    </dl>
  );
}

function Details({ resource }: { resource: ResourceInfo }) {
  return (
    <Stack gap={16}>
      <Panel title="Connections">
        <Connections resource={resource} />
      </Panel>
      <Panel title="Attributes">
        <JsonInspector value={resource.attr} />
      </Panel>
      <Panel title="Props">
        <JsonInspector value={resource.props} />
      </Panel>
      {resource.bindings.length > 0 && (
        <Panel title="Bindings">
          <JsonInspector value={resource.bindings} collapseAt={1} />
        </Panel>
      )}
    </Stack>
  );
}

export function ResourcePage({
  stack,
  fqn,
  meta,
  tab,
  navigate
}: {
  stack: StackInfo,
  fqn: string,
  meta: ResourceMeta | undefined,
  tab: string | undefined,
  navigate: (p: string, o?: { replace?: boolean }) => void
}) {
  const resource = stack.resources.find(r => r.fqn === fqn);
  if(!resource) {
    return (
      <Panel>
        <EmptyState title={`No resource '${fqn}' in ${stack.stage}`}>It may have been deleted, or it lives in another stage.</EmptyState>
      </Panel>
    );
  }
  const view = meta?.viewId ? views.find(v => v.id === meta.viewId) : undefined;
  const items = [
    ...(view ? [{ key: "view", label: view.title }] : []),
    { key: "details", label: "Details" },
    { key: "logs", label: "Logs" }
  ];
  const active = items.some(i => i.key === tab) ? tab! : items[0]!.key;
  const label = typeLabel(resource.type);

  return (
    <Page
      title={resource.logicalId}
      subtitle={
        <span title={resource.type}>
          {label.provider ? `${label.provider} ${label.name}` : label.name}
          {resource.fqn !== resource.logicalId && <span className="av-muted"> · {resource.fqn}</span>}
        </span>
      }
      badges={
        <>
          <StatusPill status={resource.status} />
          {resource.mode === "local" && <Badge tone="info">local</Badge>}
          {resource.mode === "live" && <Badge tone="warn">cloud</Badge>}
        </>
      }
      actions={meta?.link && resource.mode !== "local" ? <LinkButton href={meta.link}>Open in {providerName(resource.type)}</LinkButton> : undefined}
    >
      <Tabs
        items={items}
        value={active}
        onChange={key => navigate(`${window.location.pathname}?tab=${key}`, { replace: true })}
      />
      {active === "view" && view && (
        meta?.local === false ? (
          <ExternalLinkCard href={meta.link} provider={providerName(resource.type)}>
            {resource.logicalId} runs in the cloud, not in a local simulator, so its data can't be shown here.
          </ExternalLinkCard>
        ) : (
          <ViewHost viewId={view.id} resource={resource} stack={stack} />
        )
      )}
      {active === "details" && <Details resource={resource} />}
      {active === "logs" && (
        <Panel flush>
          <LogsPanel fqn={resource.fqn} />
        </Panel>
      )}
    </Page>
  );
}
