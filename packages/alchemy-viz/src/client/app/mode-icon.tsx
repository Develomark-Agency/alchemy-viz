import { Cloud, CircleHelp, Laptop } from "lucide-react";
import { cn } from "../../ui/index.ts";
import type { ResourceInfo } from "../../types.ts";
import { modeOf } from "./resource-mode.ts";

type Mode = ReturnType<typeof modeOf>;

/** Where a resource runs, as a mark: a laptop for a local simulator, a cloud for the cloud, a question mark when it can't be told. */
export function ModeIcon({ mode, size = 14, className }: { mode: Mode, size?: number, className?: string }) {
  const Icon = mode === "local" ? Laptop : mode === "live" ? Cloud : CircleHelp;
  return <Icon aria-hidden style={{ width: size, height: size }} className={cn("shrink-0", className)} strokeWidth={1.75} />;
}

/** What the mark says, in one word (it sits in a tooltip sized by the provider and kind, so it must not be wider): where it runs, or that it failed. */
export function placeText(r: ResourceInfo, failed: boolean) {
  if(failed) return r.failedBy ? "Blocked" : "Failed";
  const mode = modeOf(r);
  return mode === "local" ? "Local" : mode === "live" ? "Cloud" : "Unknown";
}
