import { Button as ButtonPart } from "@ui-sdk/react/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "./cn.ts";
import { withClass } from "./with-class.ts";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "icon" | "icon-sm";

const base = "group/button relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium select-none transition-colors outline-offset-2 disabled:opacity-50 data-disabled:opacity-50 data-pending:cursor-wait [&_svg]:size-3.5 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  default: "border-line-strong bg-surface text-fg shadow-xs hover:bg-hover",
  primary: "border-transparent bg-fg text-canvas hover:bg-fg/85",
  danger: "border-line-strong bg-surface text-danger hover:border-danger/50 hover:bg-danger-soft",
  ghost: "border-transparent bg-transparent text-fg-muted hover:bg-hover hover:text-fg"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]",
  icon: "size-8",
  "icon-sm": "size-7"
};

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "md") {
  return cn(base, variants[variant], sizes[size]);
}

export type ButtonProps = ComponentProps<typeof ButtonPart> & {
  variant?: ButtonVariant,
  size?: ButtonSize
};

/**
 * Return a Promise from `onClick` and the button shows a spinner and
 * ignores presses until it settles.
 */
export function Button({ variant = "default", size = "md", className, children, ...rest }: ButtonProps) {
  return (
    <ButtonPart {...rest} className={withClass(buttonClass(variant, size), className)}>
      <span className="pointer-events-none absolute inset-0 hidden items-center justify-center group-data-pending/button:flex">
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      </span>
      <span className="contents group-data-pending/button:invisible">{children as ReactNode}</span>
    </ButtonPart>
  );
}

/** A link that looks like a button. External links open in a new tab. */
export function LinkButton({
  href,
  external = /^https?:/.test(href),
  variant = "default",
  size = "md",
  className,
  children
}: {
  href: string,
  external?: boolean,
  variant?: ButtonVariant,
  size?: ButtonSize,
  className?: string,
  children: ReactNode
}) {
  return (
    <ButtonPart
      className={cn(buttonClass(variant, size), "no-underline", className)}
      render={<a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} />}
    >
      {children}
    </ButtonPart>
  );
}

/** An icon-only button. `label` names it for screen readers and shows as a tooltip. */
export function IconButton({ label, children, size = "icon-sm", variant = "ghost", ...rest }: Omit<ButtonProps, "aria-label"> & { label: string }) {
  return (
    <Tooltip delay={400}>
      <TooltipTrigger render={<Button {...rest} variant={variant} size={size} aria-label={label}>{children}</Button> as ReactElement} />
      <TooltipContent sideOffset={6} className={tooltipClass}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export const tooltipClass = "z-50 rounded-md bg-fg px-2 py-1 text-xs font-medium text-canvas shadow-popup origin-(--transform-origin) transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0";
