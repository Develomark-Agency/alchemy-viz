import { NavigationMenuLink } from "@ui-sdk/react/navigation-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { cn, Kbd, SearchInput } from "../../ui/index.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

type Scope = "all" | "local" | "cloud";

function plural(name: string) {
  if(/y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if(/s$/.test(name)) return name;
  return `${name}s`;
}

/** A short second line for a resource: where a Worker serves, or where it runs. */
function detail(r: ResourceInfo) {
  const url = r.attr?.url;
  if(typeof url === "string") return url.replace(/^https?:\/\//, "");
  if(r.fqn !== r.logicalId) return r.fqn;
  return r.mode === "local" ? "local simulator" : r.mode === "live" ? "cloud" : r.status;
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

  const counts = {
    all: stack.resources.length,
    local: stack.resources.filter(r => r.mode === "local").length,
    cloud: stack.resources.filter(r => r.mode === "live").length
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = stack.resources.filter(r => (scope === "all" || (scope === "local" ? r.mode === "local" : r.mode === "live"))
      && (!q || `${r.fqn} ${r.type} ${typeLabel(r.type).name}`.toLowerCase().includes(q)));
    return group(shown);
  }, [stack.resources, query, scope]);

  return (
    <div className="flex max-h-[min(72vh,640px)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col gap-3 border-line p-4 md:w-60 md:border-r">
          <div>
            <div className="text-[13px] font-semibold">Resources</div>
            <div className="text-xs text-fg-subtle">{stack.resources.length} in {stack.name} · {stack.stage}</div>
          </div>
          <SearchInput aria-label="Filter resources" placeholder="Filter resources" value={query} onValueChange={setQuery} />
          <div className="flex flex-col gap-0.5 max-md:hidden">
            <ScopeButton active={scope === "all"} onClick={() => setScope("all")} label="All" count={counts.all} />
            <ScopeButton active={scope === "local"} onClick={() => setScope("local")} label="Running locally" count={counts.local} dot />
            <ScopeButton active={scope === "cloud"} onClick={() => setScope("cloud")} label="Cloud only" count={counts.cloud} />
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
          {groups.length === 0 && <div className="px-6 py-10 text-[13px] text-fg-muted">No resources match.</div>}
          {groups.map(({ provider, types }, i) => (
            <section key={provider} className={cn("min-w-0 px-5 py-4", i === 0 ? "lg:flex-1" : "border-line max-lg:border-t lg:w-64 lg:border-l")}>
              <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{provider}</h3>
              <div className={cn("grid gap-x-4 gap-y-3", i === 0 && "grid-cols-[repeat(auto-fill,minmax(190px,1fr))]")}>
                {types.map(([type, resources]) => (
                  <div key={type} className="min-w-0">
                    <div className="px-2 pb-1.5 text-xs text-fg-subtle">{plural(typeLabel(type).name)}</div>
                    <ul className="flex flex-col gap-0.5">
                      {resources.map(r => {
                        const current = pathname === `/r/${encodeURIComponent(r.fqn)}` || pathname === `/r/${r.fqn}`;
                        return (
                          <li key={r.fqn}>
                            <NavigationMenuLink
                              current={current}
                              onClick={onNavigate}
                              render={<Link to="/r/$fqn" params={{ fqn: r.fqn }} />}
                              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors outline-offset-[-2px] hover:bg-hover aria-[current=page]:bg-hover"
                            >
                              <ResourceIcon type={r.type} size={22} />
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-[13px] font-medium">{r.fqn}</span>
                                <span className="truncate text-[11.5px] text-fg-subtle">{detail(r)}</span>
                              </span>
                              {r.mode === "local" && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-ok" title="Running locally" />}
                              {r.mode === "live" && <span className="ml-auto text-[10px] font-semibold text-warn uppercase">cloud</span>}
                            </NavigationMenuLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
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
  );
}
