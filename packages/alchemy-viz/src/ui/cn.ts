import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "canvas",
        "surface",
        "surface-2",
        "hover",
        "line",
        "line-strong",
        "fg",
        "fg-muted",
        "fg-subtle",
        "accent",
        "accent-fg",
        "accent-soft",
        "accent-soft-fg",
        "ok",
        "ok-soft",
        "warn",
        "warn-soft",
        "danger",
        "danger-soft",
        "info",
        "info-soft"
      ]
    }
  }
});

/** Joins class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
