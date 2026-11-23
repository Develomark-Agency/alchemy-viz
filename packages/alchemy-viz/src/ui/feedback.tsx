import { CircleAlert, Cloud, ExternalLink, Info, Laptop, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { buttonClass } from "./button.tsx";
import { cn } from "cn";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

// Banners keep soft fills; inline tags only tint their text, so a table of
// them reads as information rather than a row of candy.
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  accent: "bg-accent-soft text-accent-soft-fg",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info"
};

const tagText: Record<Tone, string> = {
  neutral: "text-fg-muted",
  accent: "text-accent-soft-fg",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info"
};

/** A small, flat label: a type, a flag, a count. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone, children: ReactNode, className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-[4px] border border-line bg-surface-2/60 px-1.5 font-mono text-[11px] whitespace-nowrap", tagText[tone], className)}>
      {children}
    </span>
  );
}

/**
 * A resource's lifecycle status as plain text. Settled states stay quiet;
 * only work in progress and failures draw attention.
 */
export function StatusText({ status, className }: { status: string, className?: string }) {
  const failed = /fail|error/i.test(status);
  const busy = !failed && /ing$|pending|queued/i.test(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap capitalize", failed ? "text-danger" : busy ? "text-warn" : "text-fg-muted", className)}>
      {failed && <CircleAlert className="size-3.5" />}
      {busy && <Spinner className="size-3" />}
      {status}
    </span>
  );
}

/** @deprecated Use StatusText. */
export const StatusPill = StatusText;

/** Where a resource runs: a local simulator, or the cloud. */
export function RunsOn({ mode, className }: { mode: "local" | "live" | undefined, className?: string }) {
  if(!mode) return <span className={cn("text-[13px] text-fg-subtle", className)}>—</span>;
  const Icon = mode === "local" ? Laptop : Cloud;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-fg-muted", className)}>
      <Icon className="size-3.5 text-fg-subtle" strokeWidth={1.75} />
      {mode === "local" ? "Local" : "Cloud"}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cn("inline-block size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-[spin_2s_linear_infinite]", className)} />;
}

/**
 * True once `delay` ms have passed. Loading states wait this long before
 * showing, so data that arrives quickly never flashes a spinner.
 */
export function useDelayed(delay = 200) {
  const [ready, setReady] = useState(delay <= 0);
  useEffect(() => {
    if(delay <= 0) return;
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return ready;
}

/** Shows after a short grace period, then fades in; keeps its height so nothing jumps. */
export function Loading({ label = "Loading…", delay = 200 }: { label?: string, delay?: number }) {
  const show = useDelayed(delay);
  return (
    <div className="flex min-h-24 items-center justify-center gap-2 py-10 text-[13px] text-fg-muted">
      {show && (
        <span className="flex items-center gap-2 animate-in fade-in duration-300 ease-out">
          <Spinner />
          {label}
        </span>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-2", className)} />;
}

export function EmptyState({ title, children, action, icon }: { title: ReactNode, children?: ReactNode, action?: ReactNode, icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-fg-subtle [&_svg]:size-5">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-[13px] text-fg-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const bannerIcons = { info: Info, warn: TriangleAlert, danger: CircleAlert };

export function Banner({ tone = "info", children, className }: { tone?: "info" | "warn" | "danger", children: ReactNode, className?: string }) {
  const Icon = bannerIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] break-words", tones[tone], className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Renders nothing for a missing error. */
export function ErrorBanner({ error, className }: { error: Error | string | null | undefined, className?: string }) {
  if(!error) return null;
  return (
    <Banner tone="danger" className={className}>
      {typeof error === "string" ? error : error.message}
    </Banner>
  );
}

/**
 * Shown in place of a view when a resource can't be explored locally,
 * such as one that only exists in the cloud.
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
    <div className="rounded-lg border border-dashed border-line-strong bg-surface">
      <EmptyState
        title={title}
        icon={<ExternalLink />}
        action={href && (
          <a href={href} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
            Open in {provider ?? "dashboard"}
            <ExternalLink />
          </a>
        )}
      >
        {children ?? "This resource isn't running in a local simulator, so its data can't be shown here."}
      </EmptyState>
    </div>
  );
}
