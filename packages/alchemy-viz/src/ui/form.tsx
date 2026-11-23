import { FieldDescription as FieldDescriptionPart, FieldError as FieldErrorPart, FieldLabel as FieldLabelPart, Field as FieldPart } from "@ui-sdk/react/field";
import { InputClear, InputGroup, Input as InputPart } from "@ui-sdk/react/input";
import { SegmentedControlIndicator, SegmentedControlItem, SegmentedControl as SegmentedControlPart } from "@ui-sdk/react/segmented-control";
import { SelectContent, SelectItem, SelectItemIndicator, Select as SelectPart, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { SwitchThumb, Switch as SwitchPart } from "@ui-sdk/react/switch";
import { Textarea as TextareaPart } from "@ui-sdk/react/textarea";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useAfterFirstFrame } from "./tabs.tsx";
import { cn } from "cn";
import { withClass } from "./with-class.ts";

const control = "rounded-md border border-line-strong bg-surface text-[13px] text-fg shadow-xs transition-colors placeholder:text-fg-subtle hover:border-fg-subtle/60 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 data-disabled:opacity-50";

export function Field({ className, ...rest }: ComponentProps<typeof FieldPart>) {
  return <FieldPart {...rest} className={withClass("flex min-w-0 flex-col gap-1.5", className)} />;
}

export function FieldLabel({ className, ...rest }: ComponentProps<typeof FieldLabelPart>) {
  return <FieldLabelPart {...rest} className={withClass("text-xs font-medium text-fg-muted", className)} />;
}

export function FieldDescription({ className, ...rest }: ComponentProps<typeof FieldDescriptionPart>) {
  return <FieldDescriptionPart {...rest} className={withClass("text-xs text-fg-subtle", className)} />;
}

export function FieldError({ className, ...rest }: ComponentProps<typeof FieldErrorPart>) {
  return <FieldErrorPart {...rest} className={withClass("text-xs text-danger", className)} />;
}

export function Input({ className, ...rest }: ComponentProps<typeof InputPart>) {
  return <InputPart {...rest} className={withClass(cn(control, "h-8 min-w-0 px-2.5"), className)} />;
}

/** A search box with a leading icon and a clear button. */
export function SearchInput({ className, ...rest }: ComponentProps<typeof InputPart>) {
  return (
    <InputGroup className={cn("relative flex min-w-0 items-center", typeof className === "string" ? className : undefined)}>
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
      <InputPart {...rest} type="search" className={cn(control, "h-8 w-full min-w-0 pr-7 pl-8 [&::-webkit-search-cancel-button]:hidden")} />
      <InputClear aria-label="Clear" className="absolute right-1.5 flex size-5 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg">
        <X className="size-3" />
      </InputClear>
    </InputGroup>
  );
}

export function Textarea({ className, ...rest }: ComponentProps<typeof TextareaPart>) {
  return <TextareaPart {...rest} className={withClass(cn(control, "min-h-20 w-full px-2.5 py-2 font-mono text-xs leading-relaxed"), className)} />;
}

export function Switch({ className, ...rest }: Omit<ComponentProps<typeof SwitchPart>, "children">) {
  return (
    <SwitchPart {...rest} className={withClass("relative inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface-2 p-0.5 transition-colors data-checked:border-accent data-checked:bg-accent data-disabled:cursor-default data-disabled:opacity-50", className)}>
      <SwitchThumb className="size-3.5 rounded-full bg-fg-subtle shadow-xs transition-[translate,background-color] duration-200 ease-out data-checked:translate-x-3.5 data-checked:bg-accent-fg rtl:data-checked:-translate-x-3.5" />
    </SwitchPart>
  );
}

export interface Option<T extends string = string> {
  value: T,
  label: ReactNode,
  /** Text used when `label` isn't a string. */
  text?: string
}

/** A single-choice popup list. */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  "aria-label": ariaLabel
}: {
  value: T | null,
  onValueChange: (value: T) => void,
  options: Array<Option<T>>,
  placeholder?: string,
  className?: string,
  "aria-label"?: string
}) {
  return (
    <SelectPart<T> value={value} onValueChange={v => v !== null && !Array.isArray(v) && onValueChange(v as T)} placeholder={placeholder} itemToLabel={v => labelText(options.find(o => o.value === v)) ?? v}>
      <SelectTrigger aria-label={ariaLabel} className={cn(control, "inline-flex h-8 min-w-0 items-center justify-between gap-2 px-2.5 text-left data-placeholder:text-fg-subtle", className)}>
        <SelectValue className="truncate" />
        <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
      </SelectTrigger>
      <SelectContent sideOffset={4} className={popupList}>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} label={labelText(o)} className={popupItem}>
            <span className="truncate">{o.label}</span>
            <SelectItemIndicator className="ml-auto text-accent">
              <Check className="size-3.5" />
            </SelectItemIndicator>
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPart>
  );
}

function labelText(o: Option | undefined) {
  if(!o) return undefined;
  return o.text ?? (typeof o.label === "string" ? o.label : o.value);
}

export const popupList = "z-50 max-h-[min(var(--available-height),320px)] min-w-(--anchor-width) overflow-y-auto rounded-lg border border-line bg-surface p-1 text-[13px] shadow-popup outline-none origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:opacity-0";

export const popupItem = "flex h-7 cursor-default items-center gap-2 rounded-sm px-2 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-hover";

/** A compact row of mutually exclusive choices. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel
}: {
  value: T,
  onValueChange: (value: T) => void,
  options: Array<Option<T>>,
  className?: string,
  "aria-label": string
}) {
  const ready = useAfterFirstFrame();
  return (
    <SegmentedControlPart<T>
      aria-label={ariaLabel}
      value={value}
      onValueChange={v => v !== null && onValueChange(v)}
      className={cn("relative inline-flex h-8 items-center rounded-md border border-line bg-surface-2 p-0.5", className)}
    >
      <SegmentedControlIndicator className={cn("absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-sm bg-surface shadow-xs ring-1 ring-line motion-reduce:transition-none", ready && "transition-[left,width] duration-200 ease-in-out")} />
      {options.map(o => (
        <SegmentedControlItem key={o.value} value={o.value} className="relative z-1 inline-flex h-full items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg data-checked:text-fg [&_svg]:size-3.5">
          {o.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControlPart>
  );
}
