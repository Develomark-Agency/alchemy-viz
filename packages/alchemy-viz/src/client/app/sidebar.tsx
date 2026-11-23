import { useMemo, useState } from "react";
import type { StackInfo } from "../../types.ts";
import { Button, Select } from "../../ui/index.ts";
import { resourcePath } from "../index.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import type { Route } from "./router.ts";
import { typeLabel } from "./type-label.ts";
import type { StackResponse } from "./use-stack.ts";

function NavLink({
  href,
  active,
  navigate,
  children
}: {
  href: string,
  active: boolean,
  navigate: (p: string) => void,
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="viz-nav-link"
      aria-current={active ? "page" : undefined}
      onClick={e => {
        if(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export function Sidebar({
  data,
  route,
  navigate,
  onStage,
  onRefresh,
  refreshing
}: {
  data: StackResponse | undefined,
  route: Route,
  navigate: (p: string) => void,
  onStage: (stage: string) => void,
  onRefresh: () => void,
  refreshing: boolean
}) {
  const [filter, setFilter] = useState("");
  const stack: StackInfo | undefined = data?.stack;
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const byType = new Map<string, StackInfo["resources"]>();
    for(const r of stack?.resources ?? []) {
      if(q && !`${r.fqn} ${r.type}`.toLowerCase().includes(q)) continue;
      byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
    }
    return [...byType.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stack, filter]);

  return (
    <aside className="viz-sidebar">
      <div className="viz-brand">
        <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
          <path d="M12 3h8v2h-2v7l8 14a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l8-14V5h-2z" fill="var(--av-accent)" />
        </svg>
        <span>alchemy-viz</span>
      </div>

      {stack && (
        <div className="viz-stack-card">
          <div className="viz-stack-name av-truncate" title={stack.name}>
            {stack.name}
          </div>
          <div className="av-row" style={{ gap: 6 }}>
            <Select
              aria-label="Stage"
              value={stack.stage}
              options={stack.stages}
              onChange={e => onStage(e.target.value)}
              style={{ flex: 1, height: 28, fontSize: 12 }}
            />
            <Button size="sm" onClick={onRefresh} loading={refreshing} aria-label="Refresh" title="Refresh">
              {!refreshing && "↻"}
            </Button>
          </div>
        </div>
      )}

      <nav className="viz-nav">
        <NavLink href="/" active={route.name === "overview"} navigate={navigate}>
          Overview
        </NavLink>
        <NavLink href="/logs" active={route.name === "logs"} navigate={navigate}>
          Logs
        </NavLink>
        {data?.pages.map(p => (
          <NavLink
            key={p.id}
            href={`/pages/${encodeURIComponent(p.route)}`}
            active={route.name === "page" && route.route === p.route}
            navigate={navigate}
          >
            {p.title}
          </NavLink>
        ))}
      </nav>

      <div className="viz-resources">
        <input
          className="av-input"
          placeholder="Filter resources"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          aria-label="Filter resources"
          style={{ width: "100%", height: 30 }}
        />
        {groups.map(([type, resources]) => {
          const label = typeLabel(type);
          return (
            <div key={type} className="viz-group">
              <div className="viz-group-title" title={type}>
                {label.provider && <span className="av-muted">{label.provider} · </span>}
                {label.name}
              </div>
              {resources.map(r => (
                <NavLink
                  key={r.fqn}
                  href={resourcePath(r.fqn)}
                  active={route.name === "resource" && route.fqn === r.fqn}
                  navigate={navigate}
                >
                  <ResourceIcon type={r.type} size={18} />
                  <span className="av-truncate av-grow">{r.fqn}</span>
                  {r.mode === "live" && <span className="viz-live" title="Pinned to the cloud">live</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        {stack && groups.length === 0 && <div className="av-muted" style={{ fontSize: 12, padding: "4px 2px" }}>No matches</div>}
      </div>
    </aside>
  );
}
