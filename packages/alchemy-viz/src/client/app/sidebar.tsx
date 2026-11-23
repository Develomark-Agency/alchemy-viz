import { Link } from "@tanstack/react-router";
import { Activity, LayoutGrid, Monitor, Moon, RefreshCw, ScrollText, Search, Sun } from "lucide-react";
import { type ReactNode, useContext, useMemo, useState } from "react";
import { IconButton, Kbd, SegmentedControl, Select } from "../../ui/index.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { setTheme, storedTheme, type ThemeChoice } from "./theme.ts";
import { typeLabel } from "./type-label.ts";
import { StageContext, useRefresh, useStack } from "./use-stack.ts";

const navLink = "flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg data-[status=active]:bg-hover data-[status=active]:font-medium data-[status=active]:text-fg [&_svg]:size-3.5 [&_svg]:shrink-0";

function GroupTitle({ children }: { children: ReactNode }) {
  return <div className="truncate px-2 pb-1 text-[11px] font-medium text-fg-subtle">{children}</div>;
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { data } = useStack();
  const { setStage } = useContext(StageContext);
  const refresh = useRefresh();
  const [theme, setThemeState] = useState<ThemeChoice>(storedTheme);
  const stack = data?.stack;

  const groups = useMemo(() => {
    const byType = new Map<string, NonNullable<typeof stack>["resources"]>();
    for(const r of stack?.resources ?? []) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
    return [...byType.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stack]);

  return (
    <aside className="flex flex-col gap-4 border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-b-0">
      <div className="flex items-center gap-2 px-2">
        <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
          <path d="M12 3h8v2h-2v7l8 14a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l8-14V5h-2z" fill="var(--av-accent)" />
        </svg>
        <span className="text-[13px] font-semibold tracking-tight">alchemy-viz</span>
      </div>

      {stack && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/60 p-2.5">
          <div className="truncate px-0.5 text-[13px] font-medium" title={stack.name}>{stack.name}</div>
          <div className="flex items-center gap-1.5">
            <Select
              aria-label="Stage"
              className="h-7 flex-1 text-xs"
              value={stack.stage}
              onValueChange={setStage}
              options={stack.stages.map(s => ({ value: s, label: s }))}
            />
            <IconButton label="Refresh" variant="default" onClick={() => refresh()}>
              <RefreshCw />
            </IconButton>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onSearch}
        className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg-subtle shadow-xs transition-colors hover:border-line-strong hover:text-fg-muted"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Dashboard">
        <Link to="/" activeOptions={{ exact: true }} className={navLink}>
          <LayoutGrid />
          Overview
        </Link>
        <Link to="/logs" className={navLink}>
          <ScrollText />
          Logs
        </Link>
        {data?.pages.map(p => (
          <Link key={p.id} to="/pages/$" params={{ _splat: p.route }} className={navLink}>
            <Activity />
            {p.title}
          </Link>
        ))}
      </nav>

      <nav className="flex flex-1 flex-col gap-3" aria-label="Resources">
        {groups.map(([type, resources]) => {
          const label = typeLabel(type);
          return (
            <div key={type}>
              <GroupTitle>
                <span title={type}>
                  {label.provider && `${label.provider} · `}
                  {label.name}
                </span>
              </GroupTitle>
              <div className="flex flex-col gap-0.5">
                {resources.map(r => (
                  <Link key={r.fqn} to="/r/$fqn" params={{ fqn: r.fqn }} className={navLink}>
                    <ResourceIcon type={r.type} size={18} />
                    <span className="truncate">{r.fqn}</span>
                    {r.mode === "live" && <span className="ml-auto text-[10px] font-semibold text-warn uppercase">cloud</span>}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <SegmentedControl<ThemeChoice>
        aria-label="Theme"
        className="self-start"
        value={theme}
        onValueChange={choice => {
          setTheme(choice);
          setThemeState(choice);
        }}
        options={[
          { value: "system", label: <Monitor aria-label="System" />, text: "System" },
          { value: "light", label: <Sun aria-label="Light" />, text: "Light" },
          { value: "dark", label: <Moon aria-label="Dark" />, text: "Dark" }
        ]}
      />
    </aside>
  );
}
