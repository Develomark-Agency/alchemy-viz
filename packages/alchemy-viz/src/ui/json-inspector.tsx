import { TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel, Tree } from "@ui-sdk/react/tree";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { cn } from "./cn.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function preview(value: unknown): ReactNode {
  if(value === null || value === undefined) return <span className="text-warn">{String(value)}</span>;
  if(typeof value === "string") return <span className="text-ok">{JSON.stringify(value)}</span>;
  if(typeof value === "number") return <span className="text-info">{value}</span>;
  if(typeof value === "boolean") return <span className="text-warn">{String(value)}</span>;
  const size = Array.isArray(value) ? value.length : Object.keys(value as object).length;
  return <span className="text-fg-subtle">{Array.isArray(value) ? `Array(${size})` : `{${size}}`}</span>;
}

function isBranch(value: unknown): value is object {
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
}

function collectPaths(value: unknown, path: string, depth: number, open: number, out: string[]) {
  if(!isBranch(value) || depth >= open) return;
  out.push(path);
  for(const [k, v] of Object.entries(value)) collectPaths(v, `${path}/${k}`, depth + 1, open, out);
}

function Node({ name, value, path }: { name: string, value: unknown, path: string }) {
  const branch = isBranch(value);
  return (
    <TreeItem value={path} label={name} className="outline-none">
      <TreeItemLabel className="flex h-6 cursor-default items-center gap-1 rounded pr-2 pl-[calc((var(--tree-level)-1)*14px+4px)] font-mono text-xs whitespace-nowrap hover:bg-hover in-focus-visible:bg-hover data-selected:bg-transparent">
        {branch
          ? (
            <TreeItemIndicator className="flex size-3.5 items-center justify-center text-fg-subtle transition-transform data-expanded:rotate-90">
              <ChevronRight className="size-3" />
            </TreeItemIndicator>
          )
          : <span className="w-3.5" />}
        <span className="text-fg-muted">{name}</span>
        <span className="text-fg-subtle">:</span>
        <span className="truncate">{preview(value)}</span>
      </TreeItemLabel>
      {branch && (
        <TreeGroup>
          {Object.entries(value).map(([k, v]) => <Node key={k} name={k} value={v} path={`${path}/${k}`} />)}
        </TreeGroup>
      )}
    </TreeItem>
  );
}

/** A collapsible, keyboard-navigable view of any JSON value. */
export function JsonInspector({ value, label = "Value", openDepth = 2, className }: { value: unknown, label?: string, openDepth?: number, className?: string }) {
  const expanded = useMemo(() => {
    const out: string[] = [];
    if(isBranch(value)) for(const [k, v] of Object.entries(value)) collectPaths(v, `$/${k}`, 1, openDepth, out);
    return out;
  }, [value, openDepth]);

  if(!isBranch(value)) return <div className={cn("font-mono text-xs", className)}>{preview(value)}</div>;
  return (
    <Tree aria-label={label} defaultExpanded={expanded} className={cn("min-w-0 overflow-x-auto", className)}>
      {Object.entries(value as Record<string, Json>).map(([k, v]) => <Node key={k} name={k} value={v} path={`$/${k}`} />)}
    </Tree>
  );
}
