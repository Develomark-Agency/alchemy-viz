import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList } from "@ui-sdk/react/command";
import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { Activity, LayoutGrid, ScrollText, Search } from "lucide-react";
import { useEffect } from "react";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

const item = "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none select-none data-highlighted:bg-hover [&>svg]:size-3.5 [&>svg]:text-fg-subtle";
const groupLabel = "px-2.5 pt-2 pb-1 text-[11px] font-medium text-fg-subtle";

/** ⌘K: jump to any resource or page. */
export function CommandPalette({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data } = useStack();
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if(e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function go(value: string) {
    onOpenChange(false);
    if(value === "page:overview") navigate({ to: "/" });
    else if(value === "page:logs") navigate({ to: "/logs" });
    else if(value.startsWith("custom:")) navigate({ to: "/pages/$", params: { _splat: value.slice(7) } });
    else if(value.startsWith("resource:")) navigate({ to: "/r/$fqn", params: { fqn: value.slice(9) } });
  }

  return (
    <Dialog open={open} onOpenChange={next => onOpenChange(next)}>
      <DialogContent className="fixed top-[12vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-popup outline-none transition-[opacity,scale] duration-100 backdrop:bg-black/30 data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:opacity-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command onAction={go} loop>
          <div className="flex items-center gap-2 border-b border-line px-3.5">
            <Search className="size-4 text-fg-subtle" />
            <CommandInput aria-label="Search resources and pages" placeholder="Search resources and pages…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
          </div>
          <CommandEmpty className="hidden px-4 py-8 text-center text-[13px] text-fg-muted data-empty:block">No matches.</CommandEmpty>
          <CommandList className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
            <CommandGroup>
              <CommandGroupLabel className={groupLabel}>Pages</CommandGroupLabel>
              <CommandItem value="page:overview" label="Overview" className={item}>
                <LayoutGrid />
                Overview
              </CommandItem>
              <CommandItem value="page:logs" label="Logs" className={item}>
                <ScrollText />
                Logs
              </CommandItem>
              {data?.pages.map(p => (
                <CommandItem key={p.id} value={`custom:${p.route}`} label={p.title} className={item}>
                  <Activity />
                  {p.title}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandGroupLabel className={groupLabel}>Resources</CommandGroupLabel>
              {data?.stack.resources.map(r => (
                <CommandItem key={r.fqn} value={`resource:${r.fqn}`} label={r.fqn} keywords={[r.type, typeLabel(r.type).name]} className={item}>
                  <ResourceIcon type={r.type} size={18} />
                  <span className="truncate">{r.fqn}</span>
                  <span className="ml-auto truncate text-xs text-fg-subtle">{typeLabel(r.type).name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
