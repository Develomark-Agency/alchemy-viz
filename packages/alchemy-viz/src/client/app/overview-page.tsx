import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { ResourceInfo } from "../../types.ts";
import { EmptyState, JsonInspector, Page, Panel, Path, RunsOn } from "../../ui/index.ts";
import { Graph } from "./graph.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

function ResourceTile({ r }: { r: ResourceInfo }) {
  return (
    <Link
      to="/r/$fqn"
      params={{ fqn: r.fqn }}
      className="group flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong hover:bg-hover/40"
    >
      <ResourceIcon type={r.type} size={30} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{r.fqn}</span>
        <span className="truncate text-xs text-fg-subtle">{typeLabel(r.type).name}</span>
      </span>
      <RunsOn mode={r.mode} className="text-xs" />
      <ChevronRight className="size-3.5 shrink-0 -translate-x-1 text-fg-subtle opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100" />
    </Link>
  );
}

function Section({ title, count, children }: { title: string, count?: number, children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 text-[13px] font-medium after:h-px after:flex-1 after:bg-line">
        <span className="flex items-baseline gap-2">
          {title}
          {count !== undefined && <span className="font-normal text-fg-subtle tabular-nums">{count}</span>}
        </span>
      </h2>
      {children}
    </section>
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
          <>
            <Panel title="Graph" flush>
              <Graph resources={stack.resources} />
            </Panel>
            <Section title="Resources" count={stack.resources.length}>
              <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                {stack.resources.map(r => <ResourceTile key={r.fqn} r={r} />)}
              </div>
            </Section>
            {output && output.length > 0 && (
              <Section title="Stack output">
                <dl className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                  {output.map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5">
                      <dt className="font-mono text-[11px] text-fg-subtle">{k}</dt>
                      <dd className="flex min-w-0">
                        <OutputValue value={v} home={stack.home} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}
          </>
        )}
    </Page>
  );
}
