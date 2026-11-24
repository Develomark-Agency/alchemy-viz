import { Menu, MenuContent, MenuGroupLabel, MenuItem, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@ui-sdk/react/menu";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuList, NavigationMenuTrigger } from "@ui-sdk/react/navigation-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Check, ChevronDown, ChevronsUpDown, Layers, LayoutGrid, Monitor, Moon, RefreshCw, ScrollText, Search, Sun } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn, IconButton, Kbd, Path } from "../../ui/index.ts";
import { Megamenu } from "./megamenu.tsx";
import { setTheme, storedTheme, type ThemeChoice } from "./theme.ts";
import { StageContext, useRefresh, useStack } from "./use-stack.ts";

// The current page gets an underline on the bar's bottom edge; an open menu
// gets a fill, so the two never look alike.
const navItem = cn(
  "relative isolate inline-flex h-full items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap text-fg-muted transition-colors outline-offset-[-2px]",
  // The hitbox is the bar's full height; the pill you see is a 32px pseudo-element.
  "before:absolute before:inset-x-0 before:top-1/2 before:-z-10 before:h-8 before:-translate-y-1/2 before:rounded-md before:transition-colors",
  "hover:text-fg hover:before:bg-hover [&_svg]:size-3.5 [&_svg]:shrink-0",
  "data-[status=active]:text-fg data-[status=active]:after:absolute data-[status=active]:after:inset-x-2.5 data-[status=active]:after:-bottom-[1.5px] data-[status=active]:after:h-0.5 data-[status=active]:after:rounded-full data-[status=active]:after:bg-fg"
);

const popup = "z-50 min-w-56 rounded-lg border border-line bg-surface p-1 text-[13px] shadow-popup outline-none origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:opacity-0";
const menuItem = "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-hover [&_svg]:size-3.5";
const groupLabel = "px-2 pt-1.5 pb-1 text-[11px] font-medium text-fg-subtle";

function NavLabel({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline">{children}</span>;
}

function ProjectSwitcher() {
  const { data } = useStack();
  const { setStage } = useContext(StageContext);
  const refresh = useRefresh();
  const stack = data?.stack;
  if(!stack) return null;
  return (
    <Menu>
      <MenuTrigger className="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-[13px] transition-colors duration-150 ease-out outline-offset-[-2px] hover:bg-hover data-open:bg-hover">
        <span className="truncate font-medium">{stack.name}</span>
        <span className="hidden text-fg-subtle sm:inline">/</span>
        <span className="hidden truncate font-mono text-xs text-fg-muted sm:inline">{stack.stage}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
      </MenuTrigger>
      <MenuContent align="start" sideOffset={6} className={popup}>
        <div className="flex flex-col gap-0.5 px-2 pt-1.5 pb-2">
          <div className="font-medium">{stack.name}</div>
          <Path path={stack.root} home={stack.home} className="max-w-80 text-[11px] text-fg-subtle" />
        </div>
        <MenuSeparator className="my-1 h-px bg-line" />
        <MenuRadioGroup value={stack.stage} onValueChange={value => setStage(String(value))}>
          <MenuGroupLabel className={groupLabel}>Stages</MenuGroupLabel>
          {stack.stages.map(stage => (
            <MenuRadioItem key={stage} value={stage} className={menuItem}>
              <span className="flex-1 font-mono text-xs">{stage}</span>
              <MenuItemIndicator className="text-accent">
                <Check />
              </MenuItemIndicator>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator className="my-1 h-px bg-line" />
        <MenuItem value="refresh" onSelect={() => refresh()} className={menuItem}>
          <RefreshCw className="text-fg-subtle" />
          Re-read state
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

const themeIcons = { system: Monitor, light: Sun, dark: Moon };

function ThemeMenu() {
  const [theme, setThemeState] = useState<ThemeChoice>(storedTheme);
  const trigger = useRef<HTMLButtonElement>(null);
  const Icon = themeIcons[theme];
  return (
    <Menu>
      <MenuTrigger ref={trigger} aria-label="Theme" className="flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg data-open:bg-hover [&_svg]:size-3.5">
        <Icon />
      </MenuTrigger>
      <MenuContent align="end" sideOffset={6} className={cn(popup, "min-w-40")}>
        <MenuRadioGroup
          value={theme}
          onValueChange={value => {
            const choice = value as ThemeChoice;
            const box = trigger.current?.getBoundingClientRect();
            setTheme(choice, {
              origin: box && { x: box.left + box.width / 2, y: box.top + box.height / 2 },
              update: () => flushSync(() => setThemeState(choice))
            });
          }}
        >
          <MenuGroupLabel className={groupLabel}>Theme</MenuGroupLabel>
          {(["system", "light", "dark"] as const).map(choice => {
            const ChoiceIcon = themeIcons[choice];
            return (
              <MenuRadioItem key={choice} value={choice} className={menuItem}>
                <ChoiceIcon className="text-fg-subtle" />
                <span className="flex-1 capitalize">{choice}</span>
                <MenuItemIndicator className="text-accent">
                  <Check />
                </MenuItemIndicator>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Spins while the state is re-read, for at least one turn so a fast refresh still registers. */
function RefreshButton({ refresh }: { refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <IconButton
      label="Re-read state"
      size="icon"
      onClick={async () => {
        if(busy) return;
        setBusy(true);
        try {
          await Promise.all([refresh(), new Promise(r => setTimeout(r, 600))]);
        } finally {
          setBusy(false);
        }
      }}
    >
      <RefreshCw className={cn(busy && "animate-spin [animation-duration:600ms]")} />
    </IconButton>
  );
}

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { data } = useStack();
  const refresh = useRefresh();
  const [open, setOpen] = useState<string | null>(null);
  const resourcesOpen = open === "resources";
  const onResource = useRouterState({ select: s => s.location.pathname.startsWith("/r/") });
  const pathname = useRouterState({ select: s => s.location.pathname });
  // Any navigation closes the menus, however it happened (a link on the page, back, the palette).
  useEffect(() => setOpen(null), [pathname]);

  // The open megamenu is modal (a scrim covers the page), so the page holds still
  // under it: no scrolling, and no overscroll bounce pulling it away from the bar.
  useEffect(() => {
    if(!resourcesOpen) return;
    const root = document.documentElement;
    const { overflow, overscrollBehavior } = root.style;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    return () => {
      root.style.overflow = overflow;
      root.style.overscrollBehavior = overscrollBehavior;
    };
  }, [resourcesOpen]);

  // The SDK keeps a hover-opened panel open while the pointer is anywhere in the hull
  // spanning trigger and panel, and the full-width megamenu makes that hull cover the
  // bar beside the trigger. So close it ourselves once the pointer rests elsewhere on
  // the bar; the panel sits outside the header, so crossing into it never counts.
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  function onBarPointerMove(event: ReactPointerEvent) {
    window.clearTimeout(leaveTimer.current);
    if(!resourcesOpen || event.pointerType === "touch") return;
    if((event.target as Element).closest("[data-resources-item]")) return;
    leaveTimer.current = window.setTimeout(() => {
      setOpen(null);
      // Closing hands focus back to the trigger, which would draw a focus ring on a
      // menu the pointer opened and left; only drop focus that landed there.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if(active instanceof HTMLElement && active.closest("[data-resources-item]")) active.blur();
      });
    }, 80);
  }

  return (
    <>
      <header id="viz-top-bar" onPointerMove={onBarPointerMove} onPointerLeave={() => window.clearTimeout(leaveTimer.current)} className="sticky top-0 z-40 flex h-[52px] items-center gap-2 border-b border-line bg-canvas px-3 sm:gap-3 sm:px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1" aria-label="alchemy-viz home">
          <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
            <path d="M12 3h8v2h-2v7l8 14a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l8-14V5h-2z" fill="var(--av-accent)" />
          </svg>
          <span className="hidden text-[13px] font-semibold tracking-tight lg:inline">alchemy-viz</span>
        </Link>
        <span className="hidden h-5 w-px shrink-0 bg-line lg:block" />
        <ProjectSwitcher />

        <NavigationMenu aria-label="Dashboard" value={open} onValueChange={setOpen} openOnHover delay={180} className="h-full min-w-0 sm:ml-2">
          <NavigationMenuList className="flex h-full items-center gap-0.5">
            <NavigationMenuItem className="h-full">
              <Link to="/" activeOptions={{ exact: true }} className={navItem}>
                <LayoutGrid />
                <NavLabel>Overview</NavLabel>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem value="resources" className="h-full" data-resources-item="">
              <NavigationMenuTrigger aria-label="Resources" data-status={onResource ? "active" : undefined} className={cn(navItem, "data-open:text-fg data-open:before:bg-hover")}>
                <Layers />
                <NavLabel>Resources</NavLabel>
                <ChevronDown className="!size-3 text-fg-subtle transition-transform duration-200 ease-out in-data-open:rotate-180" />
              </NavigationMenuTrigger>
              <NavigationMenuContent
                anchor="#viz-top-bar"
                side="bottom"
                align="start"
                sideOffset={0}
                collisionPadding={0}
                // Drops in from under the bar: it's visible within 200ms, slides down by
                // 320ms and the blur clears last (400ms), so the sharpening reads. It
                // stays on its own compositor layer (will-change), so the blur and
                // slide don't repaint the whole panel and its shadow every frame.
                // Exits back up, faster.
                className="z-40 w-(--anchor-width) border-b border-line bg-surface shadow-[0_18px_40px_-16px_rgb(0_0_0/0.25)] outline-none transition-[opacity,translate,filter] [transition-duration:200ms,320ms,400ms] ease-(--ease-out) will-change-[opacity,translate,filter] data-ending-style:-translate-y-2 data-ending-style:opacity-0 data-ending-style:blur-[4.5px] data-ending-style:[transition-duration:140ms,180ms,180ms] data-starting-style:-translate-y-3 data-starting-style:opacity-0 data-starting-style:blur-[8px] motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:blur-none motion-reduce:data-ending-style:blur-none"
              >
                {data && <Megamenu stack={data.stack} onNavigate={() => setOpen(null)} />}
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem className="h-full">
              <Link to="/logs" className={navItem}>
                <ScrollText />
                <NavLabel>Logs</NavLabel>
              </Link>
            </NavigationMenuItem>
            {data?.pages.map(p => (
              <NavigationMenuItem key={p.id} className="h-full">
                <Link to="/pages/$" params={{ _splat: p.route }} className={navItem}>
                  <Activity />
                  <NavLabel>{p.title}</NavLabel>
                </Link>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSearch}
            aria-label="Search resources"
            className="flex h-8 items-center gap-2 rounded-md border-line text-fg-subtle transition-colors hover:text-fg-muted max-lg:w-8 max-lg:justify-center lg:w-60 lg:border lg:px-2.5 lg:shadow-xs lg:hover:border-line-strong"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="hidden flex-1 text-left text-[13px] lg:inline">Search resources…</span>
            <span className="hidden lg:inline-flex"><Kbd>⌘K</Kbd></span>
          </button>
          <RefreshButton refresh={refresh} />
          <ThemeMenu />
        </div>
      </header>
      {/* Dims the page under the open megamenu; a press closes it. */}
      <div
        aria-hidden
        onClick={() => setOpen(null)}
        className={cn("fixed inset-x-0 top-[52px] bottom-0 z-30 bg-black/25 transition-opacity duration-200 ease-out", resourcesOpen ? "opacity-100" : "pointer-events-none opacity-0")}
      />
    </>
  );
}
