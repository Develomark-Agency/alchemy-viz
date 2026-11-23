import type { CSSProperties } from "react";
import { cn } from "../../ui/index.ts";
import { providerHue, typeMonogram } from "./type-label.ts";

export function ResourceIcon({ type, size = 20, className }: { type: string, size?: number, className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[5px] font-mono font-semibold tracking-tighter",
        "bg-[hsl(var(--hue)_90%_55%/0.13)] text-[light-dark(hsl(var(--hue)_75%_38%),hsl(var(--hue)_90%_68%))]",
        className
      )}
      style={{ "--hue": providerHue(type), width: size, height: size, fontSize: size * 0.42 } as CSSProperties}
    >
      {typeMonogram(type)}
    </span>
  );
}
