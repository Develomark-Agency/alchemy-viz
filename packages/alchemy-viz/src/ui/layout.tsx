import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./cn.ts";

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
    <div className={cn("flex min-w-0 flex-col gap-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2.5 text-xl font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            {badges}
          </h1>
          {subtitle && <p className="mt-1 text-[13px] text-fg-muted">{subtitle}</p>}
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
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          {title ? <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">{title}</h2> : <span />}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("min-w-0", !flush && "p-4", bodyClassName)}>{children}</div>
      {footer && <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-fg-muted">{footer}</div>}
    </section>
  );
}

/**
 * List and detail side by side. Stacks when its own width can't fit the
 * list plus `minRight` for the detail, wherever it's placed.
 */
export function Split({ left, right, leftWidth = 320, minRight = 420 }: { left: ReactNode, right: ReactNode, leftWidth?: number, minRight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if(!el) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry!.contentRect.width >= leftWidth + minRight + 16));
    observer.observe(el);
    return () => observer.disconnect();
  }, [leftWidth, minRight]);

  return (
    <div
      ref={ref}
      className={cn("grid min-w-0 items-start gap-4", wide && "grid-cols-[var(--split-left)_minmax(0,1fr)]")}
      style={{ "--split-left": `${leftWidth}px` } as CSSProperties}
    >
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
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
