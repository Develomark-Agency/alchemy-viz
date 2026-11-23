import { ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import { CopyButton } from "./copy-button.tsx";
import { fold, isBranch, JsonInspector } from "./json-inspector.tsx";

export interface PropertyItem {
  key: string,
  /** Any value: primitives, JSON strings, objects and arrays all get a fitting display. */
  value: unknown,
  /** Replaces the automatic display, e.g. with links. Nothing is copied then. */
  display?: ReactNode
}

export interface PropertySection {
  title: ReactNode,
  items: PropertyItem[],
  /** Show the number of items beside the title. Off for fixed rows. */
  count?: boolean,
  /** Shown in place of rows when there are none. */
  empty?: ReactNode
}

/** `{ a: 1 }` → `[{ key: "a", value: 1 }]`. */
export function toProperties(record: unknown): PropertyItem[] {
  if(!record || typeof record !== "object") return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function parseJsonString(value: string): unknown {
  const text = value.trim();
  if(!/^[[{]/.test(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isPrimitive(value: unknown) {
  return value === null || typeof value !== "object";
}

function copyText(value: unknown): string | undefined {
  if(value === undefined) return undefined;
  if(typeof value === "string") return value;
  if(isPrimitive(value)) return String(value);
  return JSON.stringify(value, null, 2);
}

/** A primitive in a property sheet: plain text, not JSON syntax. */
function Scalar({ value }: { value: unknown }) {
  if(value === null || value === undefined) return <span className="text-fg-subtle">null</span>;
  if(typeof value === "boolean") return <span className="font-mono text-xs">{String(value)}</span>;
  if(typeof value === "number" || typeof value === "bigint") return <span className="font-mono text-xs tabular-nums">{String(value)}</span>;
  const text = String(value);
  if(text === "") return <span className="text-fg-subtle">Empty</span>;
  if(/^https?:\/\/\S+$/.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer" className="group/link inline-flex max-w-full items-center gap-0.5 font-mono text-xs underline decoration-line-strong underline-offset-2 transition-[text-decoration-color] duration-150 hover:decoration-fg">
        <span className="truncate">{text}</span>
        <ArrowUpRight className="size-3 shrink-0 text-fg-subtle transition-[translate,color] duration-150 ease-out group-hover/link:translate-x-px group-hover/link:-translate-y-px group-hover/link:text-fg" />
      </a>
    );
  }
  // Values read as data, in one font; only real prose (a few words or more) uses the UI font.
  return <span className={cn("break-words", /\S+\s+\S+\s+\S+\s+\S+/.test(text) ? "text-[13px]" : "font-mono text-xs")}>{text}</span>;
}

/**
 * Any value as a sheet cell. Short arrays of primitives become tags, flat
 * objects a nested key list, and anything deeper an inspector tree.
 * JSON stored as a string (a D1 `payload` column) is shown as JSON.
 */
export function PropertyValue({ value }: { value: unknown }) {
  if(typeof value === "string") {
    const parsed = parseJsonString(value);
    if(parsed !== undefined) return <PropertyValue value={parsed} />;
  }
  if(isPrimitive(value)) return <Scalar value={value} />;
  if(Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(isPrimitive)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v, i) => <span key={i} className="rounded-sm bg-surface-2 px-1.5 font-mono text-xs leading-5 ring-1 ring-line ring-inset">{String(v)}</span>)}
      </span>
    );
  }

  if(!isBranch(value)) return <span className="text-fg-subtle">{Array.isArray(value) ? "None" : "Empty"}</span>;

  const [, inner] = fold("", value);
  const entries = isBranch(inner) && !Array.isArray(inner) ? Object.entries(inner) : undefined;
  if(entries && entries.length <= 10 && entries.every(([, v]) => isPrimitive(v))) {
    return (
      <dl className="grid grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="truncate font-mono text-xs leading-5 text-fg-subtle" title={k}>{k}</dt>
            <dd className="min-w-0 leading-5"><Scalar value={v} /></dd>
          </Fragment>
        ))}
      </dl>
    );
  }
  return <JsonInspector value={value} openDepth={1} unwrap className="-ml-1.5" />;
}

function Row({ item }: { item: PropertyItem }) {
  const copy = item.display === undefined ? copyText(item.value) : undefined;
  return (
    <dl className="group/row col-span-3 grid grid-cols-subgrid items-start gap-x-4 px-4 py-1.5 transition-colors duration-150 ease-out hover:bg-hover/40">
      <dt className="truncate pt-px font-mono text-xs leading-5 text-fg-muted" title={item.key}>{item.key}</dt>
      <dd className="min-w-0 text-[13px] leading-5">
        {item.display ?? <PropertyValue value={item.value} />}
      </dd>
      <span className="-my-0.5 flex w-6 justify-end">
        {copy !== undefined && (
          <CopyButton
            text={copy}
            label={`Copy ${item.key}`}
            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          />
        )}
      </span>
    </dl>
  );
}

/**
 * A property sheet: keys in one aligned column, values beside them, a copy
 * button on hover. Sections share one grid so their keys line up too.
 */
export function PropertyList({ items, sections, className }: { items?: PropertyItem[], sections?: PropertySection[], className?: string }) {
  const groups: PropertySection[] = sections ?? [{ title: undefined, items: items ?? [] }];
  return (
    <div className={cn("grid grid-cols-[fit-content(200px)_minmax(0,1fr)_auto]", className)}>
      {groups.map((group, i) => (
        <div key={i} className={cn("col-span-3 grid grid-cols-subgrid pb-1.5", i > 0 && "border-t border-line", !group.title && "pt-1.5")}>
          {group.title && (
            <div className="col-span-3 flex items-baseline gap-2 px-4 pt-3.5 pb-1.5 text-xs font-medium text-fg-muted">
              {group.title}
              {group.count !== false && group.items.length > 0 && <span className="font-normal text-fg-subtle tabular-nums">{group.items.length}</span>}
            </div>
          )}
          {group.items.length === 0
            ? <div className="col-span-3 px-4 py-2 text-[13px] text-fg-subtle">{group.empty ?? "None"}</div>
            : group.items.map(item => <Row key={item.key} item={item} />)}
        </div>
      ))}
    </div>
  );
}
