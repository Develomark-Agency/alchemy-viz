/**
 * The stack's dependency graph: React Flow for rendering and interaction,
 * ELK's layered layout for placement (dependencies left, dependents right).
 */
import { useNavigate } from "@tanstack/react-router";
import { Background, BackgroundVariant, Controls, type Edge, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";
import type { ResourceInfo } from "../../types.ts";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";

const NODE_W = 212;
const NODE_H = 52;
const elk = new ELK();

type ResourceNode = Node<{ resource: ResourceInfo }, "resource">;

function ResourceNodeView({ data }: NodeProps<ResourceNode>) {
  const r = data.resource;
  return (
    <div className="flex h-full w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong bg-surface px-3 transition-colors hover:border-fg">
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
      <ResourceIcon type={r.type} size={26} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{r.logicalId}</div>
        <div className="truncate text-[11.5px] text-fg-subtle">{typeLabel(r.type).name}</div>
      </div>
      {r.mode === "local" && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-ok" title="Running locally" />}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
    </div>
  );
}

const nodeTypes = { resource: ResourceNodeView };

export function Graph({ resources }: { resources: ResourceInfo[] }) {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<Map<string, { x: number, y: number }>>();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const edges = useMemo<Edge[]>(() => {
    const known = new Set(resources.map(r => r.fqn));
    return resources.flatMap(r => r.downstream.filter(d => known.has(d)).map(d => ({
      id: `${r.fqn}->${d}`,
      source: r.fqn,
      target: d,
      style: { stroke: "var(--av-fg-subtle)", strokeWidth: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--av-fg-subtle)", width: 14, height: 14 }
    })));
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
          className="animate-in fade-in duration-300 ease-out"
          key={shape}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          onNodeClick={(_, node) => navigate({ to: "/r/$fqn", params: { fqn: node.id } })}
          aria-label="Resource dependency graph"
        >
          <Background variant={BackgroundVariant.Lines} gap={27} size={1} color="var(--av-grid)" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      )}
    </div>
  );
}
