import { TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel, Tree } from "@ui-sdk/react/tree";
import { ChevronRight } from "lucide-react";
import { createContext, Fragment, useContext, useMemo, useState } from "react";
import { cn } from "cn";
import { Collapse } from "./motion.tsx";

/** The open branches, so each group can animate its own opening and closing. */
const ExpandedContext = createContext<ReadonlySet<string>>(new Set());

type Branch = Record<string, unknown> | unknown[];

/** Short arrays of plain values (`["a", "b"]`) read best on one line, so they stay leaves. */
function isInlineArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && value.length <= 5
    && value.every(v => v === null || typeof v !== "object")
    && JSON.stringify(value).length <= 80;
}

export function isBranch(value: unknown): value is Branch {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0 && !isInlineArray(value);
}

/** A primitive, or `{}` / `[]` for an empty object or array. */
function Leaf({ value }: { value: unknown }) {
  if(value === null || value === undefined) return <span className="text-fg-subtle">{String(value)}</span>;
  if(typeof value === "string") return <span className="text-ok">"{value}"</span>;
  if(typeof value === "number" || typeof value === "bigint") return <span className="text-info">{String(value)}</span>;
  if(typeof value === "boolean") return <span className="text-warn">{String(value)}</span>;
  if(isInlineArray(value) && value.length > 0) {
    return (
      <span className="text-fg-subtle">
        [{value.map((v, i) => <Fragment key={i}>{i > 0 && ", "}<Leaf value={v} /></Fragment>)}]
      </span>
    );
  }
  return <span className="text-fg-subtle">{Array.isArray(value) ? "[]" : "{}"}</span>;
}

const PREVIEW_ITEMS = 6;

/**
 * A one-line summary of a collapsed object or array, like a browser
 * console: `{ id: 3, name: "4K monitor", … }`. Nested branches show as
 * `{…}` or `[…]`. CSS truncates whatever doesn't fit.
 */
function Preview({ value }: { value: Branch }) {
  const isArray = Array.isArray(value);
  const entries = Object.entries(value);
  const shown = entries.slice(0, PREVIEW_ITEMS);
  return (
    <span className="text-fg-subtle">
      {isArray ? "[" : "{ "}
      {shown.map(([k, v], i) => (
        <Fragment key={k}>
          {i > 0 && ", "}
          {!isArray && <span className="text-fg-muted">{k}: </span>}
          {isBranch(v) ? (Array.isArray(v) ? "[…]" : "{…}") : <Leaf value={v} />}
        </Fragment>
      ))}
      {entries.length > shown.length && `, … ${entries.length - shown.length} more`}
      {isArray ? "]" : " }"}
    </span>
  );
}

/**
 * Folds chains of single children into one row, so `{ data: { bindings: [x] } }`
 * reads as `data.bindings[0]` → x instead of three nested rows.
 */
export function fold(key: string, value: unknown): [string, unknown] {
  let label = key;
  let current = value;
  for(;;) {
    if(Array.isArray(current) && current.length === 1 && isBranch(current[0])) {
      label += "[0]";
      current = current[0];
    } else if(isBranch(current) && !Array.isArray(current) && Object.keys(current).length === 1) {
      const [k, v] = Object.entries(current)[0]!;
      if(!isBranch(v)) break;
      label += `.${k}`;
      current = v;
    } else break;
  }
  return [label, current];
}

/** Characters in the largest index of an array; undefined for objects. */
function indexWidth(value: Branch) {
  return Array.isArray(value) ? String(value.length - 1).length : undefined;
}

function children(value: Branch) {
  return Object.entries(value).map(([k, v]) => fold(k, v));
}

/** Big arrays start with their items collapsed: the previews already summarize them. */
const LONG_ARRAY = 3;

function collectOpen(value: Branch, path: string, depth: number, openDepth: number, out: string[]) {
  const collapseItems = Array.isArray(value) && value.length > LONG_ARRAY;
  for(const [k, v] of children(value)) {
    if(!isBranch(v) || depth >= openDepth || collapseItems) continue;
    out.push(`${path}/${k}`);
    collectOpen(v, `${path}/${k}`, depth + 1, openDepth, out);
  }
}

function Node({ name, value, path, index }: { name: string, value: unknown, path: string, index?: number }) {
  const branch = isBranch(value);
  const open = useContext(ExpandedContext).has(path);
  return (
    <TreeItem value={path} label={name} className="outline-none">
      <TreeItemLabel
        className={cn(
          "flex h-6 cursor-default items-center gap-2 rounded pr-2 pl-[calc((var(--tree-level)-1)*14px+4px)] font-mono text-xs whitespace-nowrap hover:bg-hover [&:has([data-expanded])_[data-preview]]:opacity-0 in-focus-visible:bg-hover data-selected:bg-transparent",
          // A branch row toggles on click, so it shouldn't select text; leaf values stay selectable to copy.
          branch && "cursor-pointer select-none"
        )}
      >
        <span className="flex shrink-0 items-center gap-1">
          {branch
            ? (
              <TreeItemIndicator className="flex size-3.5 items-center justify-center text-fg-subtle transition-transform duration-150 ease-out data-expanded:rotate-90">
                <ChevronRight className="size-3" />
              </TreeItemIndicator>
            )
            : <span className="w-3.5" />}
          {index
            // Array indexes right-align to the widest one, so `9` and `10` line up.
            ? <span className="text-right text-fg-subtle tabular-nums" style={{ minWidth: `${index}ch` }}>{name}</span>
            : <span className="text-fg-muted">{name}</span>}
        </span>
        <span className="min-w-0 truncate" title={typeof value === "string" ? value : undefined}>
          {branch
            // The preview is only for a collapsed row; open, the children say it.
            ? <span data-preview className="transition-opacity duration-150 ease-out"><Preview value={value} /></span>
            : <Leaf value={value} />}
        </span>
      </TreeItemLabel>
      {branch && (
        // Kept mounted, without the `hidden` the tree would set, so closing can animate.
        <TreeGroup keepMounted render={props => <div {...props} hidden={undefined} />}>
          <Collapse open={open}>
            {children(value).map(([k, v]) => <Node key={k} name={k} value={v} path={`${path}/${k}`} index={indexWidth(value)} />)}
          </Collapse>
        </TreeGroup>
      )}
    </TreeItem>
  );
}

/**
 * A collapsible, keyboard-navigable view of any JSON value. Collapsed rows
 * preview their contents inline, and single-child chains fold into one row.
 */
export function JsonInspector({ value: input, label = "Value", openDepth = 2, unwrap, className }: {
  value: unknown,
  label?: string,
  openDepth?: number,
  /** Skip wrapper objects and one-item arrays at the top, showing what they hold. */
  unwrap?: boolean,
  className?: string
}) {
  const value = unwrap ? fold("", input)[1] : input;
  const defaults = useMemo(() => {
    const out: string[] = [];
    if(isBranch(value)) collectOpen(value, "$", 1, openDepth, out);
    return out;
  }, [value, openDepth]);
  const [expanded, setExpanded] = useState(defaults);
  // A new value starts from its own defaults.
  const [seen, setSeen] = useState(defaults);
  if(seen !== defaults) {
    setSeen(defaults);
    setExpanded(defaults);
  }
  const open = useMemo(() => new Set(expanded), [expanded]);

  if(!isBranch(value)) return <div className={cn("font-mono text-xs", className)}><Leaf value={value} /></div>;
  return (
    <ExpandedContext.Provider value={open}>
      <Tree aria-label={label} expanded={expanded} onExpandedChange={setExpanded} className={cn("min-w-0", className)}>
        {children(value).map(([k, v]) => <Node key={k} name={k} value={v} path={`$/${k}`} index={indexWidth(value)} />)}
      </Tree>
    </ExpandedContext.Provider>
  );
}
