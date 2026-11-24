import { Archive, Box, Boxes, Cpu, Database, Flag, Globe, Inbox, KeyRound, ListOrdered, type LucideIcon, Mail, Timer, Workflow } from "lucide-react";
import { cn } from "../../ui/index.ts";
import { ProviderMark, providerOf } from "./providers.tsx";

const known: Array<[RegExp, LucideIcon]> = [
  [/Worker$/, Cpu],
  [/KV\./, KeyRound],
  [/D1/, Database],
  [/R2\./, Archive],
  [/Queue/, ListOrdered],
  [/DurableObject/, Boxes],
  [/Workflow/, Workflow],
  [/Email|Mail/, Mail],
  [/Cron|Schedule/, Timer],
  [/Domain|DNS|Route/, Globe],
  [/Inbox/, Inbox],
  [/Flag/, Flag]
];

export function iconFor(type: string): LucideIcon {
  return known.find(([pattern]) => pattern.test(type))?.[1] ?? Box;
}

/** Smallest icon that gets a provider badge; below this it would be a smudge. */
const BADGE_MIN = 26;

/**
 * A neutral, line-drawn glyph for a resource type, with its provider's mark
 * badged on the corner. Color is reserved for the provider and for state.
 */
export function ResourceIcon({ type, size = 20, className }: { type: string, size?: number, className?: string }) {
  const Icon = iconFor(type);
  const provider = size >= BADGE_MIN ? providerOf(type) : undefined;
  const badge = Math.round(size * 0.52);
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center border border-line bg-surface text-fg-muted", className)}
      // Radius scales with size, so a small icon isn't rounder than a large one.
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.19) }}
    >
      <Icon style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} strokeWidth={1.75} />
      {provider && (
        <span
          className="absolute -right-1 -bottom-1 flex items-center justify-center rounded-full border border-line bg-surface"
          style={{ width: badge, height: badge }}
        >
          <ProviderMark provider={provider} size={Math.round(badge * 0.62)} />
        </span>
      )}
    </span>
  );
}
