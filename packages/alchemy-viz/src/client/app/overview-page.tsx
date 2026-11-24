import { Link } from "@tanstack/react-router";
import { Braces, ChevronUp, Layers, type LucideIcon, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { easeOut } from "../../ui/easing.ts";
import { cn, CopyButton, EmptyState, JsonInspector, Kbd, Loading, Page, Panel, Path } from "../../ui/index.ts";
import { useOpenPalette } from "./command-palette.tsx";
import { Graph, useGraphLayout } from "./graph.tsx";
import { ProviderMark, providerColor, providerOf, ProviderTip } from "./providers.tsx";
import { ModeIcon, placeText } from "./mode-icon.tsx";
import { matchesMode, type ModeFilter, modeOf } from "./resource-mode.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

// From this width the graph is the page, edge to edge under the bar; below it, it is a block in a padded page.
const WIDE = "(min-width: 1024px)";
/** Where the graph's free area starts when the resource list is open over its left side: the list's margin, its width, and a gap. */
const LIST_INSET = 24 + 296 + 24;

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

function ResourceRow({ r, onHighlight }: { r: ResourceInfo, onHighlight: (fqn: string | undefined) => void }) {
  const failed = isFailed(r);
  const provider = providerOf(r.type);
  const kind = typeLabel(r.type).name;
  const tint = provider && provider.id !== "custom" ? providerColor(provider) : undefined;
  const mode = modeOf(r);
  const text = placeText(r, failed);
  return (
    // The hover fill has no transition, so moving between rows switches at once instead of one fading out
    // while the next fades in. The tooltip is the page's shared one, trailing the pointer like the graph's.
    <ProviderTip
      type={r.type}
      kind={kind}
      place={{ mode, text, failed }}
      render={(
        <Link
          to="/r/$fqn"
          params={{ fqn: r.fqn }}
          onPointerEnter={() => onHighlight(r.fqn)}
          onPointerLeave={() => onHighlight(undefined)}
          onFocus={() => onHighlight(r.fqn)}
          onBlur={() => onHighlight(undefined)}
          // The row warms to its provider's color on hover; with no provider it uses the plain hover fill.
          style={{ "--row-tint": tint ? `color-mix(in srgb, ${tint} 9%, transparent)` : "var(--av-hover)" } as CSSProperties}
          className="flex h-[44px] shrink-0 items-center gap-[12px] rounded-md px-[6px] hover:bg-(--row-tint) focus-visible:bg-(--row-tint)"
        />
      )}
    >
      <ResourceIcon type={r.type} size={32} badge={false} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        {/* Line heights are in px and roomy: a tight box under `truncate` clips descenders (the g in Onboarding). */}
        <span className="truncate text-[13px] leading-[18px] font-medium">{r.fqn}</span>
        <span className="flex min-w-0 items-center gap-[6px] text-[11.5px] leading-[16px] text-fg-subtle">
          {provider && <ProviderMark provider={provider} size={12} className="shrink-0" />}
          <span className="truncate">{kind}</span>
        </span>
      </span>
      {/* A lane of its own at the right edge, level with the name, so the marks line up down the list. The tooltip says what it means. */}
      <ModeIcon mode={mode} className={cn("mt-[6px] mr-[4px] self-start", failed ? "text-danger" : "text-fg-subtle")} />
    </ProviderTip>
  );
}

/**
 * Every resource. Rows slide to their new places, and fade in and out, as the filter changes; the list's
 * height follows its content, eased to match. When there are more rows than room, it scrolls (with no
 * scrollbar drawn: one appearing and vanishing as the height eases would shift the rows).
 */
function ResourceList({ resources, empty, onHighlight }: { resources: ResourceInfo[], empty: string, onHighlight: (fqn: string | undefined) => void }) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  // Which edges have more list past them: those fade, hinting that it scrolls that way.
  const [fade, setFade] = useState({ top: false, bottom: false });
  function updateFade() {
    const el = scroller.current;
    if(!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    setFade(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
  }
  useLayoutEffect(() => {
    const el = content.current;
    const box = scroller.current;
    if(!el || !box) return;
    const observer = new ResizeObserver(() => {
      setHeight(el.offsetHeight);
      updateFade();
    });
    observer.observe(el);
    observer.observe(box);
    setHeight(el.offsetHeight);
    updateFade();
    return () => observer.disconnect();
  }, []);

  const duration = reduce ? 0 : 0.2;
  return (
    <nav
      ref={scroller}
      aria-label="Resources"
      onScroll={updateFade}
      style={{ height, "--fade-top": fade.top ? "20px" : "0px", "--fade-bottom": fade.bottom ? "20px" : "0px" } as CSSProperties}
      className="min-h-0 [mask-image:linear-gradient(to_bottom,transparent,#000_var(--fade-top),#000_calc(100%-var(--fade-bottom)),transparent)] overflow-y-auto overscroll-contain transition-[height,--fade-top,--fade-bottom] duration-200 ease-(--ease-out) [scrollbar-width:none] motion-reduce:transition-none [&::-webkit-scrollbar]:hidden"
    >
      {/* popLayout takes a leaving row out of the flow at once, so the rest move up while it fades. */}
      <div ref={content} className="relative flex flex-col p-[6px]">
        <AnimatePresence initial={false} mode="popLayout">
          {resources.length > 0
            ? resources.map(r => (
              <motion.div
                key={r.fqn}
                layout="position"
                className="shrink-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: duration * 0.6, ease: easeOut } }}
                transition={{ duration, ease: easeOut }}
              >
                <ResourceRow r={r} onHighlight={onHighlight} />
              </motion.div>
            ))
            : (
              <motion.p
                key="empty"
                className="px-2 py-3 text-[13px] text-fg-subtle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: duration * 0.6, ease: easeOut } }}
                transition={{ duration, ease: easeOut }}
              >
                {empty}
              </motion.p>
            )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

const filters: Array<{ id: ModeFilter, label: string }> = [
  { id: "all", label: "All" },
  { id: "local", label: "Local" },
  { id: "live", label: "Cloud" },
  // Only offered when some resource's location can't be told.
  { id: "unknown", label: "Unknown" }
];
const emptyHint: Record<ModeFilter, string> = { all: "here", local: "running locally", live: "in the cloud", unknown: "unknown" };

function Stat({ count, label, dot }: { count: number, label: string, dot?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
      <span className="font-medium text-fg tabular-nums">{count}</span>
      {label}
    </span>
  );
}

/** The stack's identity and counts: all the chrome the graph needs in its corner. */
function StackChip({ stack }: { stack: StackInfo }) {
  const { resources } = stack;
  const local = resources.filter(r => modeOf(r) === "local").length;
  const failed = resources.filter(isFailed).length;
  return (
    <header
      title={stack.root}
      className="absolute top-[12px] left-[12px] z-10 flex max-w-[calc(100%-24px)] flex-col gap-1.5 rounded-[10px] border border-line bg-surface px-[16px] py-[12px] lg:top-[24px] lg:left-[24px]"
    >
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-[16px] leading-5 font-medium tracking-[-0.01em]">{stack.name}</h1>
        <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{stack.stage}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stat count={resources.length} label="resources" />
        <Stat count={local} label="local" dot="bg-ok" />
        {failed > 0 && <Stat count={failed} label="failed" dot="bg-danger" />}
      </div>
    </header>
  );
}

/** Looks like the top bar's search; it opens the full one. */
function SearchField({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-line px-2.5 text-fg-subtle shadow-xs transition-colors hover:border-line-strong hover:text-fg-muted"
    >
      <Search className="size-[14px] shrink-0" />
      <span className="flex-1 text-left text-[13px]">Search resources…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

/**
 * Every resource, filterable. Pointing at one lights it up in the graph. It grows up from the pill, so the
 * controls sit at its bottom, where they stay put as the list above them changes height.
 */
function ResourcesPopover({ resources, onHighlight, onSearch }: { resources: ResourceInfo[], onHighlight: (fqn: string | undefined) => void, onSearch: () => void }) {
  const [filter, setFilter] = useState<ModeFilter>("all");
  const shown = resources.filter(r => matchesMode(r, filter));
  return (
    <section
      data-dock=""
      aria-label="Resources"
      className="absolute bottom-[58px] left-[12px] z-10 flex max-h-[calc(100%-168px)] w-[296px] max-w-[calc(100%-24px)] animate-in flex-col overflow-clip rounded-[10px] border border-line bg-surface shadow-popup duration-150 ease-out fade-in slide-in-from-bottom-1 lg:bottom-[66px] lg:left-[24px]"
    >
      <ResourceList resources={shown} onHighlight={onHighlight} empty={`Nothing ${emptyHint[filter]}.`} />
      <div className="flex shrink-0 flex-col gap-2 px-[12px] pt-[6px] pb-[12px]">
        <SearchField onClick={onSearch} />
        <div className="flex gap-1.5">
          {filters.filter(f => f.id !== "unknown" || resources.some(r => !modeOf(r))).map(f => (
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
      </div>
    </section>
  );
}

function DockButton({ icon: Icon, label, count, open, onClick }: { icon: LucideIcon, label: string, count: number, open: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      data-dock=""
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        "flex h-[34px] items-center gap-2 rounded-full border pr-[10px] pl-[12px] text-xs font-medium shadow-popup transition-colors",
        open ? "border-line-strong bg-surface-2 text-fg" : "border-line bg-surface text-fg-muted hover:bg-hover hover:text-fg"
      )}
    >
      <Icon className="size-[14px] shrink-0" strokeWidth={1.75} />
      <span className="text-fg">{label}</span>
      <span className="font-mono text-[11px] text-fg-subtle tabular-nums">{count}</span>
      <ChevronUp className={cn("size-[14px] shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} strokeWidth={1.75} />
    </button>
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

/** What lands on the clipboard for one output: strings as they are, anything else as JSON. */
function outputText(value: unknown) {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
}

function OutputPanel({ output, home }: { output: Array<[string, unknown]>, home: string }) {
  return (
    <section
      data-dock=""
      aria-label="Stack output"
      className="absolute bottom-[58px] left-[12px] z-10 flex max-h-[calc(100%-168px)] w-[360px] max-w-[calc(100%-24px)] animate-in flex-col gap-[12px] overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-surface p-[12px] shadow-popup duration-150 ease-out fade-in slide-in-from-bottom-1 lg:bottom-[66px] lg:left-[24px]"
    >
      <h2 className="flex items-center gap-2 text-[13px] font-medium">
        <Braces className="size-3.5 text-fg-subtle" strokeWidth={1.75} />
        Stack output
        <CopyButton text={JSON.stringify(Object.fromEntries(output), null, 2)} label="Copy all stack output" className="ml-auto" />
      </h2>
      <dl className="flex flex-col gap-[12px]">
        {output.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1">
            <dt className="flex items-center justify-between gap-2 font-mono text-[11px] text-fg-subtle">
              {k}
              <CopyButton text={outputText(v)} label={`Copy ${k}`} className="-my-1" />
            </dt>
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
  const openPalette = useOpenPalette();
  const [panel, setPanel] = useState<"resources" | "output">();
  // The resource the list is pointing at; the graph lights it up and keeps it in view.
  const [highlight, setHighlight] = useState<string>();
  const output = stack.output && typeof stack.output === "object" && !Array.isArray(stack.output) ? Object.entries(stack.output) : undefined;
  const hasOutput = !!output && output.length > 0;

  // Whichever popover is open closes on Escape or a click anywhere else.
  useEffect(() => {
    if(!panel) return;
    function onKey(event: KeyboardEvent) {
      if(event.key === "Escape") setPanel(undefined);
    }
    function onPointer(event: PointerEvent) {
      if(!(event.target as Element).closest("[data-dock]")) setPanel(undefined);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [panel]);

  // A popover that closes under the pointer never sees it leave.
  useEffect(() => {
    if(panel !== "resources") setHighlight(undefined);
  }, [panel]);

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

  // The popover's search box is the top bar's: it opens the full one, and the popover gets out of its way.
  function search() {
    setPanel(undefined);
    openPalette();
  }

  function toggle(next: "resources" | "output") {
    setPanel(current => current === next ? undefined : next);
  }

  return (
    // The graph is the page, edge to edge under the bar. Everything else is a small control floating over it.
    <div className="relative h-full max-lg:p-4">
      <div className="relative h-[75dvh] min-h-[480px] max-lg:overflow-clip max-lg:rounded-[10px] max-lg:border max-lg:border-line lg:absolute lg:inset-0 lg:h-auto lg:min-h-0">
        <Graph resources={stack.resources} layout={layout} leftInset={wide && panel === "resources" ? LIST_INSET : 0} highlight={highlight} />
        <StackChip stack={stack} />
        {panel === "resources" && <ResourcesPopover resources={stack.resources} onHighlight={setHighlight} onSearch={search} />}
        {panel === "output" && output && <OutputPanel output={output} home={stack.home} />}
        <div className="absolute bottom-[12px] left-[12px] z-10 flex gap-2 lg:bottom-[24px] lg:left-[24px]">
          <DockButton icon={Layers} label="Resources" count={stack.resources.length} open={panel === "resources"} onClick={() => toggle("resources")} />
          {hasOutput && <DockButton icon={Braces} label="Stack output" count={output.length} open={panel === "output"} onClick={() => toggle("output")} />}
        </div>
      </div>
    </div>
  );
}
