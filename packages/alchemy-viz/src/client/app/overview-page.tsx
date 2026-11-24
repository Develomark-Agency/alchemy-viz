import { Link } from "@tanstack/react-router";
import { Braces } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { cn, EmptyState, JsonInspector, Loading, Page, Panel, Path } from "../../ui/index.ts";
import { Graph, useGraphLayout } from "./graph.tsx";
import { type ProviderInfo, ProviderMark, providerColor, providerOf, TipMorph } from "./providers.tsx";
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

function ResourceRow({ r, onHover }: { r: ResourceInfo, onHover: (row: HTMLElement | null, r: ResourceInfo) => void }) {
  const failed = isFailed(r);
  const provider = providerOf(r.type);
  const tint = provider && provider.id !== "custom" ? providerColor(provider) : undefined;
  return (
    // The hover fill has no transition, so moving between rows switches at once instead of one fading out
    // while the next fades in. The tooltip is the list's own (see ResourceList), not the graph's.
    <Link
      to="/r/$fqn"
      params={{ fqn: r.fqn }}
      onPointerEnter={event => onHover(event.currentTarget, r)}
      onPointerLeave={() => onHover(null, r)}
      onFocus={event => onHover(event.currentTarget, r)}
      onBlur={() => onHover(null, r)}
      // The row warms to its provider's color on hover; with no provider it uses the plain hover fill.
      style={{ "--row-tint": tint ? `color-mix(in srgb, ${tint} 9%, transparent)` : "var(--av-hover)" } as CSSProperties}
      className="flex h-[44px] shrink-0 items-center gap-[12px] rounded-md px-[6px] hover:bg-(--row-tint) focus-visible:bg-(--row-tint)"
    >
      <ResourceIcon type={r.type} size={32} badge={false} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] leading-4 font-medium">{r.fqn}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 text-fg-subtle">
          {provider && <span data-provider-mark="" className="flex shrink-0"><ProviderMark provider={provider} size={12} /></span>}
          <span className="truncate">{typeLabel(r.type).name}</span>
        </span>
      </span>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", failed ? "bg-danger" : r.mode === "local" ? "bg-ok" : "bg-transparent")}
        title={failed ? r.failedBy ? `Blocked by ${r.failedBy}` : r.error ?? "Failed" : r.mode === "local" ? "Running locally" : undefined}
      />
    </Link>
  );
}

interface ListTip {
  key: string,
  provider: ProviderInfo,
  kind: string,
  /** Where the tooltip's top-left goes, in the viewport. */
  left: number,
  top: number
}

// The tooltip's mark has to land on the row's, so the tooltip is placed from the mark outward:
// 1px border + 6px padding in from the left, and 1px border + 4px padding + half the 16px first line up.
const TIP_MARK_INSET = 1 + 6;
const TIP_MARK_ABOVE = 1 + 4 + 8;

/**
 * Every resource, with one tooltip shared by all rows. Hovering a row opens it (after a beat) over that row's
 * provider mark; moving to another row slides it there and morphs its label, instead of opening a new one.
 */
function ResourceList({ resources, empty }: { resources: ResourceInfo[], empty: string }) {
  const [tip, setTip] = useState<ListTip>();
  const [open, setOpen] = useState(false);
  // Whether the last change moved an open tooltip (it slides) or opened a closed one (it appears in place).
  const [slide, setSlide] = useState(false);
  // New each time it opens, so an opening is sized to its own row rather than easing from the last one's.
  const [session, setSession] = useState(0);
  const isOpen = useRef(false);
  const timers = useRef<{ open?: number, close?: number }>({});
  useEffect(() => () => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
  }, []);

  function hide() {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    timers.current.close = window.setTimeout(() => {
      isOpen.current = false;
      setOpen(false);
    }, 60);
  }

  function onHover(row: HTMLElement | null, r: ResourceInfo) {
    const provider = providerOf(r.type);
    const mark = row?.querySelector("[data-provider-mark]");
    if(!row || !provider || !mark) return hide();
    window.clearTimeout(timers.current.close);
    const m = mark.getBoundingClientRect();
    const next: ListTip = {
      key: r.fqn,
      provider,
      kind: typeLabel(r.type).name,
      left: m.left - TIP_MARK_INSET,
      top: m.top + m.height / 2 - TIP_MARK_ABOVE
    };
    if(isOpen.current) {
      setSlide(true);
      setTip(next);
      return;
    }
    window.clearTimeout(timers.current.open);
    timers.current.open = window.setTimeout(() => {
      isOpen.current = true;
      setSlide(false);
      setSession(n => n + 1);
      setTip(next);
      setOpen(true);
    }, 300);
  }

  return (
    <nav
      aria-label="Resources"
      onScroll={hide}
      className="flex max-h-72 min-h-0 flex-col overflow-y-auto overscroll-contain px-[6px] pb-[6px] [scrollbar-width:thin] lg:max-h-none"
    >
      {resources.length > 0
        ? resources.map(r => <ResourceRow key={r.fqn} r={r} onHover={onHover} />)
        : <p className="px-2 py-3 text-[13px] text-fg-subtle">{empty}</p>}
      <div
        aria-hidden
        style={tip && { left: tip.left, top: tip.top }}
        className={cn(
          "pointer-events-none fixed z-50 overflow-hidden rounded-md border border-line bg-surface px-[6px] py-[4px] text-[12px] font-medium whitespace-nowrap text-fg shadow-popup ease-(--ease-out)",
          // It appears where it opens, and only slides while it stays open; it leaves faster than it arrives.
          open ? slide ? "[transition:opacity_150ms,left_90ms,top_90ms]" : "[transition:opacity_150ms]" : "[transition:opacity_100ms]",
          open ? "opacity-100" : "opacity-0"
        )}
      >
        {tip && (
          <TipMorph key={session} id={tip.key}>
            <span className="flex flex-col">
              <span className="flex h-[16px] items-center gap-[6px]">
                <ProviderMark provider={tip.provider} size={12} className="shrink-0" />
                {tip.provider.label}
              </span>
              <span className="pl-[18px] text-[11.5px] leading-[14px] font-normal text-fg-subtle">{tip.kind}</span>
            </span>
          </TipMorph>
        )}
      </div>
    </nav>
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
    <aside className="flex min-h-0 flex-col overflow-clip rounded-[10px] border border-line bg-surface lg:absolute lg:top-[24px] lg:left-[24px] lg:z-10 lg:max-h-[calc(100%-48px)] lg:w-[312px]">
      <header className="flex flex-col gap-2.5 px-[12px] pt-[16px] pb-[16px]">
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
      <div className="flex gap-1.5 border-t border-line px-[12px] pt-[12px] pb-[6px]">
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
      <ResourceList key={filter} resources={shown} empty={`Nothing ${filter === "local" ? "running locally" : "in the cloud"}.`} />
    </aside>
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
    <section className="flex max-h-[calc(100%-48px)] flex-col gap-[12px] overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-surface p-[12px] lg:absolute lg:right-[24px] lg:bottom-[24px] lg:z-10 lg:w-[360px]">
      <h2 className="flex items-center gap-2 text-[13px] font-medium">
        <Braces className="size-3.5 text-fg-subtle" strokeWidth={1.75} />
        Stack output
      </h2>
      <dl className="flex flex-col gap-[12px]">
        {output.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1">
            <dt className="font-mono text-[11px] text-fg-subtle">{k}</dt>
            <dd className="flex min-w-0">
              <OutputValue value={v} home={home} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
