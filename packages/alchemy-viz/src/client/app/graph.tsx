/**
 * The stack's dependency graph: React Flow for rendering and interaction,
 * ELK's layered layout for placement (dependencies left, dependents right).
 */
import { useNavigate } from "@tanstack/react-router";
import { Background, BackgroundVariant, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";
import type { ResourceInfo } from "../../types.ts";
import { cn } from "../../ui/index.ts";
import { ProviderTip } from "./providers.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

const NODE_W = 212;
const NODE_H = 52;
const elk = new ELK();
// Shared by the first fit and the controls' fit button, so both frame the graph
// the same way. Pixels: a percentage is resolved against a container size the
// first fit doesn't have yet, and comes out as no padding at all.
const FIT_VIEW = { padding: "24px", maxZoom: 1 } as const;

type ResourceNode = Node<{ resource: ResourceInfo }, "resource">;

function ResourceNodeView({ data }: NodeProps<ResourceNode>) {
  const r = data.resource;
  const failed = /fail|error/i.test(r.status);
  const blocked = failed && !!r.failedBy;
  return (
    <ProviderTip type={r.type} render={<div className={cn("flex h-full w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 transition-colors", failed ? cn("bg-danger-soft/50 hover:border-danger", blocked ? "border-dashed border-danger/30" : "border-danger/40") : "border-line-strong bg-surface hover:border-fg")} />}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
      <ResourceIcon type={r.type} size={26} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{r.logicalId}</div>
        <div className="truncate text-[11.5px] text-fg-subtle">{typeLabel(r.type).name}</div>
      </div>
      {failed
        ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-danger" title={blocked ? `Blocked by ${r.failedBy}` : r.error ?? "Failed"} />
        : r.mode === "local" && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-ok" title="Running locally" />}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
    </ProviderTip>
  );
}

const nodeTypes = { resource: ResourceNodeView };

export function Graph({ resources }: { resources: ResourceInfo[] }) {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<Map<string, { x: number, y: number }>>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The layout last fitted to the view; the graph stays hidden until it matches.
  const [fitted, setFitted] = useState<string>();

  const edges = useMemo<Edge[]>(() => {
    const byFqn = new Map(resources.map(r => [r.fqn, r]));
    return resources.flatMap(r => r.downstream.filter(d => byFqn.has(d)).map(d => {
      // Edges a failure travelled along, from the root cause outward.
      const traced = byFqn.get(d)!.failedBy === r.fqn;
      const color = traced ? "var(--av-danger)" : "var(--av-fg-subtle)";
      return {
        id: `${r.fqn}->${d}`,
        source: r.fqn,
        target: d,
        style: { stroke: color, strokeWidth: traced ? 1.5 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
      };
    }));
  }, [resources]);

  // Lay out again only when the graph's shape changes, not on every poll.
  const shape = useMemo(() => JSON.stringify([resources.map(r => r.fqn), edges.map(e => e.id)]), [resources, edges]);

  useEffect(() => {
    let cancelled = false;
    elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
        "elk.spacing.nodeNode": "16",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF"
      },
      children: resources.map(r => ({ id: r.fqn, width: NODE_W, height: NODE_H })),
      edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
    }).then(layout => {
      if(cancelled) return;
      setPositions(new Map((layout.children ?? []).map(c => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])));
      const box = layout as { width?: number, height?: number };
      setSize({ width: box.width ?? 0, height: box.height ?? 0 });
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `shape` captures resources and edges
  }, [shape]);

  const nodes = useMemo<ResourceNode[]>(
    () => resources.map(r => ({
      id: r.fqn,
      type: "resource",
      position: positions?.get(r.fqn) ?? { x: 0, y: 0 },
      data: { resource: r },
      width: NODE_W,
      height: NODE_H,
      draggable: false,
      connectable: false,
      selectable: false
    })),
    [resources, positions]
  );

  const height = Math.min(Math.max(size.height + 64, 200), 460);

  return (
    <div style={{ height }} className="[&_.react-flow__attribution]:bg-transparent [&_.react-flow__attribution_a]:text-fg-subtle [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-md [&_.react-flow__controls]:border [&_.react-flow__controls]:border-line [&_.react-flow__controls-button]:border-line [&_.react-flow__controls-button]:bg-surface [&_.react-flow__controls-button]:fill-fg-muted [&_.react-flow__controls-button:hover]:bg-hover">
      {positions && (
        <ReactFlow
          className={fitted === shape ? "animate-in fade-in duration-300 ease-out" : "opacity-0"}
          key={shape}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          onNodeClick={(_, node) => navigate({ to: "/r/$fqn", params: { fqn: node.id } })}
          // React Flow's own first fit (the `fitView` prop, or fitView() in
          // onInit) runs before it knows the container's size and drops the
          // padding, so fit one frame later and show the graph once framed.
          onInit={i => requestAnimationFrame(() => void i.fitView(FIT_VIEW).then(() => setFitted(shape)))}
          aria-label="Resource dependency graph"
        >
          <Background variant={BackgroundVariant.Lines} gap={27} size={1} color="var(--av-grid)" />
          <Controls showInteractive={false} fitViewOptions={FIT_VIEW} position="bottom-right" />
        </ReactFlow>
      )}
    </div>
  );
}
