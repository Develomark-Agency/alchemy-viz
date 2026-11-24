import { NavigationMenuLink } from "@ui-sdk/react/navigation-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Transition, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { AutoHeight, cn, easeOut, Kbd, SearchInput } from "../../ui/index.ts";
import { ProviderTip } from "./providers.tsx";
import { modeOf } from "./resource-mode.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

type Scope = "all" | "local" | "cloud";

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

export function Megamenu({ stack, onNavigate }: { stack: StackInfo, onNavigate: () => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
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
    cloud: stack.resources.filter(r => modeOf(r) === "live").length
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = stack.resources.filter(r => (scope === "all" || (scope === "local" ? modeOf(r) === "local" : modeOf(r) === "live"))
      && (!q || `${r.fqn} ${r.type} ${typeLabel(r.type).name}`.toLowerCase().includes(q)));
    return group(shown);
  }, [stack.resources, query, scope]);

  const reduce = useReducedMotion();
  const presence = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: FADE }
    : { initial: fadeOut, animate: fadeIn, exit: fadeOut, transition: { ...FADE, layout: MOVE } };

  return (
    // Filtering changes how much there is; the menu resizes to fit instead of jumping.
    <AutoHeight>
      <div className="flex max-h-[min(72vh,640px)] flex-col">
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col gap-3 border-line p-4 md:w-60 md:border-r">
            <div>
              <div className="text-[13px] font-semibold">Resources</div>
              <div className="text-xs text-fg-subtle">{stack.resources.length} in {stack.name} · {stack.stage}</div>
            </div>
            <SearchInput aria-label="Filter resources" placeholder="Filter resources" value={query} onValueChange={value => change(() => setQuery(value))} />
            <div className="flex flex-col gap-0.5 max-md:hidden">
              <ScopeButton active={scope === "all"} onClick={() => change(() => setScope("all"))} label="All" count={counts.all} />
              <ScopeButton active={scope === "local"} onClick={() => change(() => setScope("local"))} label="Running locally" count={counts.local} dot />
              <ScopeButton active={scope === "cloud"} onClick={() => change(() => setScope("cloud"))} label="Cloud only" count={counts.cloud} />
            </div>
          </aside>

          <motion.div layoutScroll className={cn("relative flex min-h-0 flex-1 flex-col overscroll-contain lg:flex-row", moving ? "overflow-hidden" : "overflow-y-auto")}>
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
                                          {mode && (
                                            <span
                                              title={mode === "local" ? "Running locally" : "Cloud only"}
                                              className={cn(
                                                "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface transition-[box-shadow] group-hover/item:ring-hover group-aria-[current=page]/item:ring-hover",
                                                mode === "local" ? "bg-ok" : "bg-warn"
                                              )}
                                            />
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
          <span className="hidden items-center gap-1.5 sm:flex"><Kbd>Tab</Kbd> move</span>
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
