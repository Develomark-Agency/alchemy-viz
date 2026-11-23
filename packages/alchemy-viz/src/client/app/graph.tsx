/**
 * Dependency graph of the stack: resources in columns by depth (a resource
 * sits one column right of everything it depends on), edges drawn from
 * dependency to dependent.
 */
import { useMemo } from "react";
import type { ResourceInfo } from "../../types.ts";
import { resourcePath } from "../index.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

const NODE_W = 200;
const NODE_H = 52;
const COL_GAP = 72;
const ROW_GAP = 14;
const PAD = 12;

export function Graph({ resources, navigate }: { resources: ResourceInfo[], navigate: (p: string) => void }) {
  const layout = useMemo(() => {
    const byFqn = new Map(resources.map(r => [r.fqn, r]));
    const depth = new Map<string, number>();
    const visiting = new Set<string>();
    function depthOf(fqn: string): number {
      if(depth.has(fqn)) return depth.get(fqn)!;
      if(visiting.has(fqn)) return 0; // cycle guard
      visiting.add(fqn);
      const ups = (byFqn.get(fqn)?.upstream ?? []).filter(u => byFqn.has(u));
      const d = ups.length ? Math.max(...ups.map(depthOf)) + 1 : 0;
      visiting.delete(fqn);
      depth.set(fqn, d);
      return d;
    }
    const columns: ResourceInfo[][] = [];
    for(const r of resources) (columns[depthOf(r.fqn)] ??= []).push(r);
    const pos = new Map<string, { x: number, y: number }>();
    columns.forEach((col, c) => col.forEach((r, i) => pos.set(r.fqn, { x: PAD + c * (NODE_W + COL_GAP), y: PAD + i * (NODE_H + ROW_GAP) }))
    );
    const rows = Math.max(1, ...columns.map(c => c?.length ?? 0));
    const edges = resources.flatMap(r => r.downstream.filter(d => pos.has(d)).map(d => ({ from: pos.get(r.fqn)!, to: pos.get(d)!, key: `${r.fqn}->${d}` }))
    );
    return {
      pos,
      edges,
      width: PAD * 2 + columns.length * NODE_W + Math.max(0, columns.length - 1) * COL_GAP,
      height: PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP
    };
  }, [resources]);

  return (
    <div className="viz-graph" style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }} aria-hidden>
          {layout.edges.map(e => {
            const x1 = e.from.x + NODE_W;
            const y1 = e.from.y + NODE_H / 2;
            const x2 = e.to.x;
            const y2 = e.to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={e.key}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke="var(--av-border-strong)"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
        {resources.map(r => {
          const p = layout.pos.get(r.fqn)!;
          const href = resourcePath(r.fqn);
          return (
            <a
              key={r.fqn}
              href={href}
              className="viz-node"
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              onClick={e => {
                if(e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                navigate(href);
              }}
            >
              <ResourceIcon type={r.type} size={26} />
              <span className="av-stack" style={{ minWidth: 0 }}>
                <span className="viz-node-name av-truncate">{r.logicalId}</span>
                <span className="viz-node-type av-truncate">{typeLabel(r.type).name}</span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
