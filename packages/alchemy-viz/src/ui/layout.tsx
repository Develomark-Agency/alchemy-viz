import type { CSSProperties, ReactNode } from "react";

function cx(...c: Array<string | false | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function Page({
  title,
  subtitle,
  badges,
  actions,
  children
}: {
  title: ReactNode,
  subtitle?: ReactNode,
  badges?: ReactNode,
  actions?: ReactNode,
  children?: ReactNode
}) {
  return (
    <div className="av-page">
      <header className="av-page-header">
        <div className="av-stack" style={{ minWidth: 0 }}>
          <h1 className="av-page-title">
            <span className="av-truncate">{title}</span>
            {badges}
          </h1>
          {subtitle && <p className="av-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="av-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Panel({
  title,
  actions,
  flush,
  children,
  style,
  className
}: {
  title?: ReactNode,
  actions?: ReactNode,
  /** Remove body padding (for tables and lists that run edge to edge). */
  flush?: boolean,
  children?: ReactNode,
  style?: CSSProperties,
  className?: string
}) {
  return (
    <section className={cx("av-panel", className)} style={style}>
      {(title || actions) && (
        <div className="av-panel-header">
          {title ? <h2 className="av-panel-title">{title}</h2> : <span />}
          {actions && <div className="av-toolbar">{actions}</div>}
        </div>
      )}
      <div className={cx("av-panel-body", flush && "av-flush")}>{children}</div>
    </section>
  );
}

export function Stack({
  gap = 12,
  children,
  style,
  className
}: {
  gap?: number,
  children?: ReactNode,
  style?: CSSProperties,
  className?: string
}) {
  return (
    <div className={cx("av-stack", className)} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

export function Row({
  gap = 8,
  align = "center",
  justify,
  children,
  style,
  className
}: {
  gap?: number,
  align?: CSSProperties["alignItems"],
  justify?: CSSProperties["justifyContent"],
  children?: ReactNode,
  style?: CSSProperties,
  className?: string
}) {
  return (
    <div className={cx("av-row", className)} style={{ gap, alignItems: align, justifyContent: justify, ...style }}>
      {children}
    </div>
  );
}

/** Two columns (list + detail) that stack when their container is narrow. */
export function Split({ left, right, leftWidth = 320 }: { left: ReactNode, right: ReactNode, leftWidth?: number }) {
  return (
    <div className="av-split-container">
      <div className="av-split" style={{ "--av-split-left": `${leftWidth}px` } as CSSProperties}>
        <div style={{ minWidth: 0 }}>{left}</div>
        <div style={{ minWidth: 0 }}>{right}</div>
      </div>
    </div>
  );
}

export function Toolbar({ children }: { children?: ReactNode }) {
  return <div className="av-toolbar">{children}</div>;
}

export interface TabItem<K extends string = string> {
  key: K,
  label: ReactNode,
  count?: number
}

export function Tabs<K extends string>({
  items,
  value,
  onChange
}: {
  items: Array<TabItem<K>>,
  value: K,
  onChange: (key: K) => void
}) {
  return (
    <div className="av-tabs" role="tablist">
      {items.map(t => (
        <button
          key={t.key}
          role="tab"
          type="button"
          className="av-tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="av-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
