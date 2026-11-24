import { Link } from "@tanstack/react-router";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { cn, EmptyState, JsonInspector, Loading, Page, Panel, Path } from "../../ui/index.ts";
import { Graph, useGraphLayout } from "./graph.tsx";
import { ProviderTip } from "./providers.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

// From this width the title, resource list and stack output float over the graph;
// below it they stack around it and the page scrolls.
const WIDE = "(min-width: 1024px)";
/** Where the graph's free area starts when the left panel floats over it: its left margin, its width, and a gap. */
const LEFT_PANEL_INSET = 24 + 312 + 24;

function useWide() {
  return useSyncExternalStore(
    notify => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches
  );
}

function isFailed(r: ResourceInfo) {
  return /fail|error/i.test(r.status);
}

function ResourceRow({ r }: { r: ResourceInfo }) {
  const failed = isFailed(r);
  return (
    <ProviderTip
      type={r.type}
      render={<Link to="/r/$fqn" params={{ fqn: r.fqn }} className="flex h-8 items-center gap-2.5 rounded-md px-2 transition-colors duration-150 ease-out hover:bg-hover" />}
    >
      <ResourceIcon type={r.type} size={20} />
      <span className="truncate text-[13px] font-medium">{r.fqn}</span>
      <span className="ml-auto min-w-0 shrink-3 truncate pl-2 text-[11.5px] text-fg-subtle">{typeLabel(r.type).name}</span>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", failed ? "bg-danger" : r.mode === "local" ? "bg-ok" : "bg-transparent")}
        title={failed ? r.failedBy ? `Blocked by ${r.failedBy}` : r.error ?? "Failed" : r.mode === "local" ? "Running locally" : undefined}
      />
    </ProviderTip>
  );
}

type Filter = "all" | "local" | "live";
const filters: Array<{ id: Filter, label: string }> = [
  { id: "all", label: "All" },
  { id: "local", label: "Local" },
  { id: "live", label: "Cloud" }
];

function Stat({ count, label, dot }: { count: number, label: string, dot?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
      <span className="font-medium text-fg tabular-nums">{count}</span>
      {label}
    </span>
  );
}

/** The stack's identity, its counts, and every resource, filterable. */
function ResourcesPanel({ stack }: { stack: StackInfo }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { resources } = stack;
  const local = resources.filter(r => r.mode === "local").length;
  const failed = resources.filter(isFailed).length;
  const shown = resources.filter(r => filter === "all" || r.mode === filter);
  return (
    <aside className="flex min-h-0 flex-col overflow-clip rounded-[10px] border border-line bg-surface lg:absolute lg:top-6 lg:left-6 lg:z-10 lg:max-h-[calc(100%-48px)] lg:w-78">
      <header className="flex flex-col gap-2.5 px-5 pt-5 pb-4">
        <h1 className="truncate text-[26px] leading-8 font-medium tracking-[-0.025em]">{stack.name}</h1>
        <p className="flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
          <span className="shrink-0 font-mono text-xs">{stack.stage}</span>
          <span className="shrink-0 text-line-strong">/</span>
          <Path path={stack.root} home={stack.home} className="min-w-0" />
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Stat count={resources.length} label="resources" />
          <Stat count={local} label="local" dot="bg-ok" />
          {failed > 0 && <Stat count={failed} label="failed" dot="bg-danger" />}
        </div>
      </header>
      <div className="flex gap-1.5 border-t border-line px-3 pt-3 pb-2">
        {filters.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("h-6 rounded-full border px-2.5 text-xs font-medium transition-colors", filter === f.id ? "border-line-strong bg-surface-2 text-fg" : "border-line text-fg-muted hover:bg-hover hover:text-fg")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <nav aria-label="Resources" className="flex max-h-72 min-h-0 flex-col overflow-y-auto overscroll-contain px-1.5 pb-1.5 lg:max-h-none">
        {shown.length > 0
          ? shown.map(r => <ResourceRow key={r.fqn} r={r} />)
          : <p className="px-2 py-3 text-[13px] text-fg-subtle">Nothing {filter === "local" ? "running locally" : "in the cloud"}.</p>}
      </nav>
    </aside>
  );
}

function Section({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 text-[13px] font-medium after:h-px after:flex-1 after:bg-line">{title}</h2>
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

function OutputPanel({ output, home }: { output: Array<[string, unknown]>, home: string }) {
  return (
    <div className="max-h-[calc(100%-48px)] overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-surface p-3.5 lg:absolute lg:right-6 lg:bottom-6 lg:z-10 lg:w-90">
      <Section title="Stack output">
        <dl className="flex flex-col gap-2">
          {output.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-canvas px-3 py-2.5">
              <dt className="font-mono text-[11px] text-fg-subtle">{k}</dt>
              <dd className="flex min-w-0">
                <OutputValue value={v} home={home} />
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

export function OverviewPage() {
  const stack = useStack().data!.stack;
  // The graph fills the page, so wait for its layout: it paints finished instead of popping in.
  const layout = useGraphLayout(stack.resources);
  const wide = useWide();
  const output = stack.output && typeof stack.output === "object" && !Array.isArray(stack.output) ? Object.entries(stack.output) : undefined;

  if(stack.resources.length === 0) {
    return (
      <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-8 sm:py-7">
        <Page title={stack.name} subtitle={<span className="font-mono text-xs text-fg-muted">{stack.stage}</span>}>
          <Panel>
            <EmptyState title="No resources in this stage yet">
              Start <code className="font-mono text-xs">alchemy dev</code> in this project. Resources show up here as soon as they're created.
            </EmptyState>
          </Panel>
        </Page>
      </div>
    );
  }
  if(!layout) return <div className="px-4 py-5 sm:px-8 sm:py-7"><Loading /></div>;

  return (
    // Wide: the graph is the page, edge to edge under the bar, with panels floating over it.
    <div className="relative flex h-full flex-col gap-4 max-lg:p-4 lg:block">
      <ResourcesPanel stack={stack} />
      <div className="h-[65dvh] min-h-[420px] max-lg:overflow-clip max-lg:rounded-[10px] max-lg:border max-lg:border-line lg:absolute lg:inset-0 lg:h-auto">
        <Graph resources={stack.resources} layout={layout} leftInset={wide ? LEFT_PANEL_INSET : 0} />
      </div>
      {output && output.length > 0 && <OutputPanel output={output} home={stack.home} />}
    </div>
  );
}
