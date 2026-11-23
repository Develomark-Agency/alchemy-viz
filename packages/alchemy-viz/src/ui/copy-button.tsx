import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { toast } from "./toast.tsx";

/**
 * Copies `text` and swaps its icon for a check for a moment, so the copy
 * is confirmed where the pointer already is instead of in a toast.
 */
export function CopyButton({ text, label = "Copy", className }: { text: string, label?: string, className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if(!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async e => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          toast("Couldn't copy", { description: "The browser blocked clipboard access." });
        }
      }}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle transition-[color,background-color,scale] duration-150 ease-out hover:bg-hover hover:text-fg active:scale-[0.94] motion-reduce:active:scale-100",
        copied && "text-ok hover:text-ok",
        className
      )}
    >
      {/* Both icons stay mounted and crossfade, so the swap never jumps. */}
      <Copy className={cn("absolute size-3.5 transition-[opacity,scale] duration-150 ease-out", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
      <Check className={cn("absolute size-3.5 transition-[opacity,scale] duration-150 ease-out", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
    </button>
  );
}
