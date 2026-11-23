import type { CSSProperties } from "react";
import { providerHue, typeMonogram } from "./type-label.ts";

export function ResourceIcon({ type, size = 22 }: { type: string, size?: number }) {
  const hue = providerHue(type);
  return (
    <span
      className="viz-icon"
      aria-hidden
      style={{ "--viz-hue": hue, width: size, height: size, fontSize: size * 0.42 } as CSSProperties}
    >
      {typeMonogram(type)}
    </span>
  );
}
