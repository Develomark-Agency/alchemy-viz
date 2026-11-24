import { createContext, type CSSProperties, type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";

export function Page({
  title,
  subtitle,
  badges,
  actions,
  children,
  className
}: {
  title: ReactNode,
  subtitle?: ReactNode,
  badges?: ReactNode,
  actions?: ReactNode,
  children?: ReactNode,
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-7", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-[26px] leading-8 font-medium tracking-[-0.025em]">
            <span className="truncate">{title}</span>
            {badges}
          </h1>
          {subtitle && <p className="mt-2 text-[13px] text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** A bordered surface. `flush` removes body padding, for tables and lists. */
export function Panel({
  title,
  actions,
  flush,
  footer,
  children,
  className,
  bodyClassName
}: {
  title?: ReactNode,
  actions?: ReactNode,
  flush?: boolean,
  footer?: ReactNode,
  children?: ReactNode,
  className?: string,
  bodyClassName?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col overflow-clip rounded-[10px] border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          {title ? <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-medium">{title}</h2> : <span />}
          {/* Pulled in so a button's right inset matches its top and bottom. */}
          {actions && <div className="-mr-2 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("min-w-0", !flush && "p-4", bodyClassName)}>{children}</div>
      {footer && <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-fg-muted">{footer}</div>}
    </section>
  );
}

const SplitContext = createContext(false);

/** True inside a Split that currently shows its columns side by side. */
export function useSplitSideBySide() {
  return useContext(SplitContext);
}

/**
 * List and detail side by side. Stacks when its own width can't fit the
 * list plus `minRight` for the detail, wherever it's placed. Side by side,
 * the `sticky` column stays in view under the top bar while the page
 * scrolls the other one.
 */
export function Split({
  left,
  right,
  leftWidth = 320,
  minRight = 420,
  sticky = "right"
}: {
  left: ReactNode,
  right: ReactNode,
  leftWidth?: number,
  minRight?: number,
  sticky?: "left" | "right" | "none"
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if(!el) return;
    function fits(width: number) {
      return width >= leftWidth + minRight + 16;
    }
    // Measure now, before the first paint: the observer's first report comes
    // a frame later, which showed the stacked layout for one frame.
    setWide(fits(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => setWide(fits(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [leftWidth, minRight]);

  const stick = "sticky top-[calc(var(--topbar-h)+16px)] max-h-[calc(100dvh-var(--topbar-h)-32px)] overflow-y-auto overscroll-contain rounded-lg";
  return (
    <SplitContext.Provider value={wide}>
      <div
        ref={ref}
        className={cn("grid min-w-0 items-start gap-4", wide && "grid-cols-[var(--split-left)_minmax(0,1fr)]")}
        style={{ "--split-left": `${leftWidth}px` } as CSSProperties}
      >
        <div className={cn("min-w-0", wide && sticky === "left" && stick)}>{left}</div>
        <div className={cn("min-w-0", wide && sticky === "right" && stick)}>{right}</div>
      </div>
    </SplitContext.Provider>
  );
}

export function KeyValueList({ items, className }: { items: Array<[ReactNode, ReactNode]>, className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] gap-x-6 gap-y-2 text-[13px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v === undefined || v === null || v === "" ? <span className="text-fg-subtle">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10.5px] text-fg-muted">{children}</kbd>;
}
