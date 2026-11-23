import { TabsIndicator, TabsList as TabsListPart, Tabs as TabsPart, TabsPanel as TabsPanelPart, TabsTab as TabsTabPart } from "@ui-sdk/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { withClass } from "./with-class.ts";

export function Tabs({ className, ...rest }: ComponentProps<typeof TabsPart>) {
  return <TabsPart {...rest} className={withClass("flex min-w-0 flex-col gap-4", className)} />;
}

/** An underlined tab row. The indicator slides to the selected tab. */
export function TabsList({ className, children, ...rest }: Omit<ComponentProps<typeof TabsListPart>, "children"> & { children?: ReactNode }) {
  return (
    <TabsListPart {...rest} className={withClass("relative flex min-w-0 items-center gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {children}
      <TabsIndicator className="absolute bottom-0 left-(--active-tab-left) h-0.5 w-(--active-tab-width) rounded-full bg-fg transition-[left,width] duration-200 ease-in-out motion-reduce:transition-none" />
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
