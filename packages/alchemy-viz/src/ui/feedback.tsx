import { CircleAlert, ExternalLink, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass } from "./button.tsx";
import { cn } from "./cn.ts";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted ring-line",
  accent: "bg-accent-soft text-accent-soft-fg ring-transparent",
  ok: "bg-ok-soft text-ok ring-transparent",
  warn: "bg-warn-soft text-warn ring-transparent",
  danger: "bg-danger-soft text-danger ring-transparent",
  info: "bg-info-soft text-info ring-transparent"
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone, dot?: boolean, children: ReactNode, className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

function statusTone(status: string): Tone {
  if(/^(created|updated|ok|ready|running|active|complete)/i.test(status)) return "ok";
  if(/fail|error/i.test(status)) return "danger";
  if(/ing$|pending|queued/i.test(status)) return "warn";
  return "neutral";
}

export function StatusPill({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {status}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cn("inline-block size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-[spin_2s_linear_infinite]", className)} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-fg-muted">
      <Spinner />
      {label}
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
