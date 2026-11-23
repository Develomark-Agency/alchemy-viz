import { ChevronRight } from "lucide-react";
import { motion, type Transition, useReducedMotion } from "motion/react";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";
import { easeOut } from "./easing.ts";

const SIZE: Transition = { duration: 0.28, ease: easeOut };

/**
 * Opens and closes its children: the height grows or shrinks (so whatever
 * sits below moves with it) while the content drops in from just above,
 * fades in and comes into focus. Opacity arrives first and the blur clears
 * last, so the sharpening is visible rather than hidden behind the fade.
 * Every value animates from where it is, so reversing halfway through
 * continues smoothly instead of restarting.
 *
 * Children render only once first opened, then stay mounted so closing can
 * animate.
 */
export function Collapse({ open, children, className }: { open: boolean, children: ReactNode, className?: string }) {
  const reduce = useReducedMotion();
  const hidden = { opacity: 0, y: reduce ? 0 : -8, filter: reduce ? "blur(0px)" : "blur(4.5px)" };
  const [rendered, setRendered] = useState(open);
  // Already open on the first render (a default): show it without animating in.
  const [initiallyOpen] = useState(open);
  if(open && !rendered) setRendered(true);
  if(!rendered) return null;

  return (
    <motion.div
      initial={initiallyOpen ? false : { height: 0 }}
      animate={{ height: open ? "auto" : 0 }}
      transition={SIZE}
      className="overflow-hidden"
      // Closed content stays mounted but out of reach for focus and screen readers.
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <motion.div
        initial={initiallyOpen ? false : hidden}
        animate={open ? { opacity: 1, y: 0, filter: "blur(0px)" } : hidden}
        transition={open
          ? { opacity: { duration: 0.2, ease: easeOut }, y: { duration: 0.34, ease: easeOut }, filter: { duration: 0.4, ease: easeOut } }
          // Closing is quicker: it's getting out of the way.
          : { opacity: { duration: 0.16, ease: easeOut }, y: { duration: 0.22, ease: easeOut }, filter: { duration: 0.18, ease: easeOut } }}
        className={className}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Animates its own height to fit its content, so a panel whose content
 * changes (a filter, a loaded list) resizes smoothly and moves whatever is
 * around it with it.
 */
export function AutoHeight({ children, className }: { children: ReactNode, className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const el = inner.current;
    if(!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div initial={false} animate={{ height }} transition={SIZE} className={cn("overflow-hidden", className)}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/** A labelled toggle that opens a `Collapse` below it. */
export function Disclosure({ label, children, defaultOpen = false, className }: { label: ReactNode, children: ReactNode, defaultOpen?: boolean, className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className="group/disclosure -ml-0.5 inline-flex items-center gap-1 rounded-sm px-0.5 text-xs text-fg-muted transition-colors duration-150 ease-out select-none hover:text-fg"
      >
        <ChevronRight className="size-3 transition-transform duration-200 ease-out group-aria-expanded/disclosure:rotate-90" />
        {label}
      </button>
      <div id={id}>
        <Collapse open={open} className="pt-2">{children}</Collapse>
      </div>
    </div>
  );
}
