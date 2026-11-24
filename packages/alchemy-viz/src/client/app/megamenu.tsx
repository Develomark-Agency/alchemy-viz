import { NavigationMenuLink } from "@ui-sdk/react/navigation-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Transition, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { AutoHeight, cn, easeOut, Kbd, SearchInput } from "../../ui/index.ts";
import { ModeIcon } from "./mode-icon.tsx";
import { ProviderTip } from "./providers.tsx";
import { matchesMode, type ModeFilter, modeOf } from "./resource-mode.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

/** Items that stay slide to their new place; ones that leave fade and blur out. */
const MOVE: Transition = { type: "spring", duration: 0.38, bounce: 0 };
const fadeIn = { opacity: 1, filter: "blur(0px)", scale: 1 };
const fadeOut = { opacity: 0, filter: "blur(4px)", scale: 0.98 };
const FADE: Transition = { duration: 0.2, ease: easeOut };
/** Long enough for the slowest of the above (the spring) to land. */
const SETTLE_MS = 500;

function plural(name: string) {
  if(name.endsWith("y")) return `${name.slice(0, -1)}ies`;
  if(name.endsWith("s")) return name;
  return `${name}s`;
}

/** A short second line for a resource: where a Worker serves, or where it runs. */
function detail(r: ResourceInfo) {
  const url = r.attr?.url;
  if(typeof url === "string") return url.replace(/^https?:\/\//, "");
  if(r.fqn !== r.logicalId) return r.fqn;
  const mode = modeOf(r);
  return mode === "local" ? "Local simulator" : mode === "live" ? "Cloud" : typeLabel(r.type).name;
}

function group(resources: ResourceInfo[]) {
  const providers = new Map<string, Map<string, ResourceInfo[]>>();
  for(const r of resources) {
    const provider = r.type.split(".")[0] ?? r.type;
    const types = providers.get(provider) ?? new Map<string, ResourceInfo[]>();
    types.set(r.type, [...(types.get(r.type) ?? []), r]);
    providers.set(provider, types);
  }
  // Providers with the most resources first; types alphabetically.
  return [...providers.entries()]
    .map(([provider, types]) => ({ provider, types: [...types.entries()].sort(([a], [b]) => a.localeCompare(b)) }))
    .sort((a, b) => b.types.flatMap(([, rs]) => rs).length - a.types.flatMap(([, rs]) => rs).length || a.provider.localeCompare(b.provider));
}

function ScopeButton({ active, onClick, label, count, dot }: { active: boolean, onClick: () => void, label: string, count: number, dot?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex h-8 items-center justify-between gap-2 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg aria-pressed:bg-hover aria-pressed:font-medium aria-pressed:text-fg"
    >
      <span className="flex items-center gap-2">
        {dot && <span className="size-1.5 rounded-full bg-ok" />}
        {label}
      </span>
      <span className="text-xs text-fg-subtle tabular-nums">{count}</span>
    </button>
  );
}

type Direction = "up" | "down" | "left" | "right";
const DIRECTIONS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const LINK = "[data-slot=\"navigation-menu-link\"]";

/** Gap between two spans on one axis; 0 when they overlap. */
function gap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, b0 - a1, a0 - b1);
}

/**
 * The item a step from `from` lands on, by where things are on screen: the nearest one that way
 * sharing its row or column. Sideways, a shorter column with nothing level still takes the step,
 * at its nearest item; up or down, nothing in line means there is nowhere to go.
 */
function neighbor(from: HTMLElement, items: HTMLElement[], direction: Direction) {
  const a = from.getBoundingClientRect();
  const vertical = direction === "up" || direction === "down";
  let best: { el: HTMLElement, aligned: boolean, score: number } | undefined;
  for(const el of items) {
    if(el === from) continue;
    const b = el.getBoundingClientRect();
    // How far it lies that way; things behind or level with `from` don't count.
    const ahead = { down: b.top - a.bottom, up: a.top - b.bottom, right: b.left - a.right, left: a.left - b.right }[direction];
    if(ahead < -2) continue;
    const across = vertical ? gap(a.left, a.right, b.left, b.right) : gap(a.top, a.bottom, b.top, b.bottom);
    const aligned = across === 0;
    if(!aligned && vertical) continue;
    const offset = vertical ? Math.abs(a.left - b.left) : Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2;
    const score = aligned ? Math.max(0, ahead) * 1000 + offset : Math.max(0, ahead) + across * 2;
    if(!best || (aligned && !best.aligned) || (aligned === best.aligned && score < best.score)) best = { el, aligned, score };
  }
  return best?.el;
}

export function Megamenu({ stack, onNavigate }: { stack: StackInfo, onNavigate: () => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ModeFilter>("all");
  const pathname = useRouterState({ select: s => s.location.pathname });

  // While the list rearranges, rows on their way out are still in it and the menu is still easing to its new
  // height, so the list would overflow and flash a scrollbar. It doesn't scroll until things have settled.
  // This is set in the same update that changes the rows, so there is no frame in between.
  const [moving, setMoving] = useState(false);
  const settle = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(settle.current), []);
  function change(update: () => void) {
    update();
    setMoving(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setMoving(false), SETTLE_MS);
  }

  const counts = {
    all: stack.resources.length,
    local: stack.resources.filter(r => modeOf(r) === "local").length,
    cloud: stack.resources.filter(r => modeOf(r) === "live").length,
    unknown: stack.resources.filter(r => !modeOf(r)).length
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = stack.resources.filter(r => matchesMode(r, scope)
      && (!q || `${r.fqn} ${r.type} ${typeLabel(r.type).name}`.toLowerCase().includes(q)));
    return group(shown);
  }, [stack.resources, query, scope]);

  // The navigation menu walks its links as one list, so ↓ and → both mean "next". Arrows move
  // around the grid as it's laid out instead: this listener sits inside the panel, so it runs
  // before the menu's own and keeps the menu from also taking the key.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if(!el) return;
    function onKeyDown(event: KeyboardEvent) {
      const direction = DIRECTIONS[event.key];
      if(!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(`[data-megamenu-grid] ${LINK}`)];
      const target = event.target as HTMLElement;
      // From the filter, ↓ goes into the results; the other arrows stay with the text.
      if(target instanceof HTMLInputElement) {
        if(direction !== "down" || !items[0]) return;
        event.preventDefault();
        event.stopPropagation();
        items[0].focus();
        return;
      }
      const from = target.closest<HTMLElement>(LINK);
      if(!from || !items.includes(from)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = neighbor(from, items, direction);
      if(next) next.focus();
      else if(direction === "up") el.querySelector<HTMLInputElement>("input")?.focus();
    }
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, []);

  const reduce = useReducedMotion();
  const presence = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: FADE }
    : { initial: fadeOut, animate: fadeIn, exit: fadeOut, transition: { ...FADE, layout: MOVE } };

  return (
    // Filtering changes how much there is; the menu resizes to fit instead of jumping.
    <AutoHeight>
      <div ref={root} className="flex max-h-[min(72vh,640px)] flex-col">
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col gap-3 border-line p-4 md:w-60 md:border-r">
            <div>
              <div className="text-[13px] font-semibold">Resources</div>
              <div className="text-xs text-fg-subtle">{stack.resources.length} in {stack.name} ({stack.stage})</div>
            </div>
            <SearchInput aria-label="Filter resources" placeholder="Filter resources" value={query} onValueChange={value => change(() => setQuery(value))} />
            <div className="flex flex-col gap-0.5 max-md:hidden">
              <ScopeButton active={scope === "all"} onClick={() => change(() => setScope("all"))} label="All" count={counts.all} />
              <ScopeButton active={scope === "local"} onClick={() => change(() => setScope("local"))} label="Running locally" count={counts.local} dot />
              <ScopeButton active={scope === "live"} onClick={() => change(() => setScope("live"))} label="Cloud only" count={counts.cloud} />
              {counts.unknown > 0 && <ScopeButton active={scope === "unknown"} onClick={() => change(() => setScope("unknown"))} label="Unknown" count={counts.unknown} />}
            </div>
          </aside>

          <motion.div layoutScroll data-megamenu-grid="" className={cn("relative flex min-h-0 flex-1 flex-col overscroll-contain lg:flex-row", moving ? "overflow-hidden" : "overflow-y-auto")}>
            <LayoutGroup>
              <AnimatePresence mode="popLayout" initial={false}>
                {groups.length === 0 && <motion.div key="empty" {...presence} className="px-6 py-10 text-[13px] text-fg-muted">No resources match.</motion.div>}
                {groups.map(({ provider, types }, i) => (
                  <motion.section layout="position" key={provider} {...presence} className={cn("min-w-0 px-5 py-4", i === 0 ? "lg:flex-1" : "border-line max-lg:border-t lg:w-64 lg:border-l")}>
                    <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{provider}</h3>
                    <div className={cn("grid gap-x-4 gap-y-3", i === 0 && "grid-cols-[repeat(auto-fill,minmax(200px,260px))]")}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {types.map(([type, resources]) => (
                          <motion.div layout="position" key={type} {...presence} className="min-w-0">
                            <div className="px-2 pb-1.5 text-xs text-fg-subtle">{plural(typeLabel(type).name)}</div>
                            <ul className="flex flex-col gap-0.5">
                              <AnimatePresence mode="popLayout" initial={false}>
                                {resources.map(r => {
                                  const mode = modeOf(r);
                                  const current = pathname === `/r/${encodeURIComponent(r.fqn)}` || pathname === `/r/${r.fqn}`;
                                  return (
                                    <motion.li layout="position" key={r.fqn} {...presence}>
                                      <ProviderTip
                                        type={r.type}
                                        render={(
                                          <NavigationMenuLink
                                            current={current}
                                            onClick={onNavigate}
                                            render={<Link to="/r/$fqn" params={{ fqn: r.fqn }} />}
                                            className="group/item flex items-center gap-3 rounded-[11px] p-1.5 pr-2 transition-colors duration-150 ease-out outline-offset-[-2px] hover:bg-hover aria-[current=page]:bg-hover"
                                          />
                                        )}
                                      >
                                        <span className="relative shrink-0">
                                          <ResourceIcon type={r.type} size={32} />
                                          {/* Where it runs, as a mark on a green badge: neither place is a problem, so neither gets a warning color. */}
                                          {mode && (
                                            <span
                                              title={mode === "local" ? "Running locally" : "Cloud only"}
                                              className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-ok text-surface ring-2 ring-surface transition-[box-shadow] group-hover/item:ring-hover group-aria-[current=page]/item:ring-hover"
                                            >
                                              <ModeIcon mode={mode} size={8} strokeWidth={2.75} />
                                            </span>
                                          )}
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                          <span className="flex items-center gap-1 text-[13px] leading-tight font-medium">
                                            <span className="truncate">{r.fqn}</span>
                                            <ArrowRight className="size-3 shrink-0 -translate-x-1 text-fg-subtle opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-visible/item:translate-x-0 group-focus-visible/item:opacity-100 motion-reduce:translate-x-0" />
                                          </span>
                                          <span className="truncate text-[11.5px] leading-tight text-fg-subtle">{detail(r)}</span>
                                        </span>
                                      </ProviderTip>
                                    </motion.li>
                                  );
                                })}
                              </AnimatePresence>
                            </ul>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                ))}
              </AnimatePresence>
            </LayoutGroup>
          </motion.div>
        </div>
        <footer className="flex items-center gap-4 border-t border-line bg-surface-2/60 px-5 py-2 text-xs text-fg-subtle">
          <span className="hidden items-center gap-1.5 sm:flex"><Kbd>←↑↓→</Kbd> move</span>
          <span className="hidden items-center gap-1.5 sm:flex"><Kbd>↵</Kbd> open</span>
          <span className="hidden items-center gap-1.5 sm:flex"><Kbd>esc</Kbd> close</span>
          <Link to="/" onClick={onNavigate} className="ml-auto flex items-center gap-1.5 font-medium text-fg-muted hover:text-fg">
            View dependency graph
            <ArrowRight className="size-3.5" />
          </Link>
        </footer>
      </div>
    </AutoHeight>
  );
}
