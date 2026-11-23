import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ResourceInfo } from "../../types.ts";
import { EmptyState, JsonInspector, Page, Panel, Path, RunsOn } from "../../ui/index.ts";
import { Graph } from "./graph.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

function ResourceRow({ r }: { r: ResourceInfo }) {
  return (
    <li>
      <Link
        to="/r/$fqn"
        params={{ fqn: r.fqn }}
        className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-out hover:bg-hover"
      >
        <ResourceIcon type={r.type} size={28} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium">{r.fqn}</span>
          <span className="truncate text-xs text-fg-subtle">{typeLabel(r.type).name}</span>
        </span>
        <RunsOn mode={r.mode} className="text-xs" />
        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100" />
      </Link>
    </li>
  );
}

/** A stack output value: links stay links, paths get shortened, the rest is JSON. */
function OutputValue({ value, home }: { value: unknown, home: string }) {
  if(typeof value === "string" && /^https?:\/\//.test(value)) {
    return <a href={value} target="_blank" rel="noreferrer" className="font-mono text-xs underline decoration-line-strong underline-offset-2 hover:decoration-fg">{value}</a>;
  }
  if(typeof value === "string" && value.startsWith("/")) return <Path path={value} home={home} />;
  if(typeof value === "string") return <span className="font-mono text-xs break-all">{value}</span>;
  return <JsonInspector value={value} label="Output" openDepth={1} />;
}

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="flex flex-col divide-y divide-line">
      {items.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-xs text-fg-muted">{k}</dt>
          <dd className="flex min-w-0 justify-end text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OverviewPage() {
  const stack = useStack().data!.stack;
  const local = stack.resources.filter(r => r.mode === "local").length;
  const output = stack.output && typeof stack.output === "object" && !Array.isArray(stack.output) ? Object.entries(stack.output) : undefined;

  return (
    <Page
      title={stack.name}
      subtitle={(
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-fg-muted">
          <span className="font-mono text-xs">{stack.stage}</span>
          <span className="text-line-strong">/</span>
          <Path path={stack.root} home={stack.home} className="max-w-[40ch]" />
          <span className="text-line-strong">/</span>
          <span>{stack.resources.length} resources, {local} local</span>
        </span>
      )}
    >
      {stack.resources.length === 0
        ? (
          <Panel>
            <EmptyState title="No resources in this stage yet">
              Start <code className="font-mono text-xs">alchemy dev</code> in this project. Resources show up here as soon as they're created.
            </EmptyState>
          </Panel>
        )
        : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Panel title="Graph" flush>
              <Graph resources={stack.resources} />
            </Panel>
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title={<>Resources <span className="font-normal text-fg-subtle tabular-nums">{stack.resources.length}</span></>} flush>
                <ul className="divide-y divide-line">
                  {stack.resources.map(r => <ResourceRow key={r.fqn} r={r} />)}
                </ul>
              </Panel>
              {output && output.length > 0 && (
                <Panel title="Stack output" flush>
                  <Facts items={output.map(([k, v]) => [k, <OutputValue value={v} home={stack.home} />])} />
                </Panel>
              )}
            </div>
          </div>
        )}
    </Page>
  );
}
