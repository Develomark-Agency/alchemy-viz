import { TabsIndicator, TabsList as TabsListPart, Tabs as TabsPart, TabsPanel as TabsPanelPart, TabsTab as TabsTabPart } from "@ui-sdk/react/tabs";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { cn } from "cn";
import { withClass } from "./with-class.ts";

export function Tabs({ className, ...rest }: ComponentProps<typeof TabsPart>) {
  return <TabsPart {...rest} className={withClass("flex min-w-0 flex-col gap-4", className)} />;
}

/** An underlined tab row. The indicator slides to the selected tab. */
/** False for the first frame, so an indicator lands in place instead of sliding in from the edge. */
export function useAfterFirstFrame() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}

export function TabsList({ className, children, ...rest }: Omit<ComponentProps<typeof TabsListPart>, "children"> & { children?: ReactNode }) {
  const ready = useAfterFirstFrame();
  return (
    <TabsListPart {...rest} className={withClass("relative flex min-w-0 items-center gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {children}
      <TabsIndicator className={cn("absolute bottom-0 left-(--active-tab-left) h-0.5 w-(--active-tab-width) rounded-full bg-fg motion-reduce:transition-none", ready && "transition-[left,width] duration-200 ease-in-out")} />
    </TabsListPart>
  );
}

export function TabsTab({ className, ...rest }: ComponentProps<typeof TabsTabPart>) {
  return <TabsTabPart {...rest} className={withClass("relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-fg-muted transition-colors outline-offset-[-2px] hover:text-fg data-disabled:opacity-50 data-selected:text-fg [&_svg]:size-3.5", className)} />;
}

export function TabsPanel({ className, ...rest }: ComponentProps<typeof TabsPanelPart>) {
  return <TabsPanelPart {...rest} className={withClass("min-w-0 outline-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out", className)} />;
}

export function TabCount({ children }: { children: number | undefined }) {
  if(children === undefined) return null;
  return <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-fg-subtle tabular-nums">{children}</span>;
}
