import { type ReactNode, useEffect } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="av-spinner" role="status" aria-label={label ?? "Loading"} />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="av-empty">
      <Spinner />
      <span className="av-empty-body">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action
}: {
  title: ReactNode,
  children?: ReactNode,
  action?: ReactNode
}) {
  return (
    <div className="av-empty">
      <div className="av-empty-title">{title}</div>
      {children && <div className="av-empty-body">{children}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Banner({
  tone = "info",
  children
}: {
  tone?: "info" | "warn" | "danger",
  children: ReactNode
}) {
  return <div className={`av-banner av-banner-${tone}`}>{children}</div>;
}

/** Renders nothing when `error` is undefined. */
export function ErrorBanner({ error }: { error: Error | string | undefined | null }) {
  return error ? <Banner tone="danger">{typeof error === "string" ? error : error.message}</Banner> : null;
}

/**
 * Shown in place of a view when a resource can't be explored locally
 * (e.g. it lives only in the cloud): explains why and links to it.
 */
export function ExternalLinkCard({
  title = "Not viewable locally",
  href,
  provider,
  children
}: {
  title?: ReactNode,
  href?: string,
  provider?: string,
  children?: ReactNode
}) {
  return (
    <div className="av-panel">
      <EmptyState
        title={title}
        action={
          href ? (
            <a className="av-button av-button-primary" href={href} target="_blank" rel="noreferrer">
              Open in {provider ?? "dashboard"} <span aria-hidden>↗</span>
            </a>
          ) : undefined
        }
      >
        {children ??
        "This resource isn't running in a local simulator, so its data can't be shown here."}
      </EmptyState>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer
}: {
  open: boolean,
  title: ReactNode,
  onClose: () => void,
  children: ReactNode,
  footer?: ReactNode
}) {
  useEffect(() => {
    if(!open) return;
    function onKey(e: KeyboardEvent) {
      return e.key === "Escape" && onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if(!open) return null;
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Escape is handled on window
    <div className="av-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="av-modal" role="dialog" aria-modal="true">
        <div className="av-modal-header">
          {title}
          <button type="button" className="av-button av-button-ghost av-button-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="av-modal-body">{children}</div>
        {footer && <div className="av-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
