/**
 * The stack's dependency graph: React Flow for rendering and interaction,
 * ELK's layered layout for placement (dependencies left, dependents right).
 */
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Background, BackgroundVariant, Controls, type Edge, type FitViewOptions, Handle, MarkerType, type Node, type NodeProps, Position, ReactFlow, useReactFlow } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { createContext, type RefObject, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ResourceInfo } from "../../types.ts";
import { cn } from "../../ui/index.ts";
import { ProviderTip } from "./providers.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { modeOf } from "./resource-mode.ts";
import { typeLabel } from "./type-label.ts";

const NODE_W = 212;
const NODE_H = 52;
const elk = new ELK();
/**
 * Shared by the first fit and the controls' fit button, so both frame the graph
 * the same way. Pixels: a percentage is resolved against a container size the
 * first fit doesn't have yet, and comes out as no padding at all. `leftInset`
 * keeps the graph clear of a panel floating over its left edge.
 */
function fitViewOptions(leftInset: number): FitViewOptions<ResourceNode> {
  return { padding: { top: "24px", right: "24px", bottom: "24px", left: `${leftInset + 24}px` as const }, maxZoom: 1 };
}

type ResourceNode = Node<{ resource: ResourceInfo }, "resource">;

/** The resource something outside the graph (the overview's list) is pointing at; its node lights up. */
const HighlightContext = createContext<string | undefined>(undefined);

/** Room kept between a revealed node and the edge of the view. */
const REVEAL_MARGIN = 24;

/** How far to move a span so it sits inside [min, max]; it favors keeping the start in view. */
function shift(start: number, end: number, min: number, max: number) {
  if(start < min) return min - start;
  if(end > max) return Math.max(max - end, min - start);
  return 0;
}

/**
 * Brings the highlighted node into view by panning, only as far as needed and only when it isn't already
 * visible. `leftInset` is the width of whatever floats over the graph's left side. It waits a beat, so
 * sweeping the pointer down a list doesn't chase every row it crosses.
 */
function Reveal({ fqn, positions, leftInset, frame }: { fqn?: string, positions: GraphLayout["positions"], leftInset: number, /** The element the graph fills, for its size. */ frame: RefObject<HTMLElement | null> }) {
  const { getViewport, setViewport } = useReactFlow();
  useEffect(() => {
    const at = fqn ? positions[fqn] : undefined;
    if(!at) return;
    const timer = window.setTimeout(() => {
      const { clientWidth: width = 0, clientHeight: height = 0 } = frame.current ?? {};
      const { x, y, zoom } = getViewport();
      const left = at.x * zoom + x;
      const top = at.y * zoom + y;
      const dx = shift(left, left + NODE_W * zoom, leftInset + REVEAL_MARGIN, width - REVEAL_MARGIN);
      const dy = shift(top, top + NODE_H * zoom, REVEAL_MARGIN, height - REVEAL_MARGIN);
      if(dx || dy) void setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 250 });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [fqn, positions, leftInset, frame, getViewport, setViewport]);
  return null;
}

function ResourceNodeView({ data }: NodeProps<ResourceNode>) {
  const r = data.resource;
  const failed = /fail|error/i.test(r.status);
  const blocked = failed && !!r.failedBy;
  const lit = useContext(HighlightContext) === r.fqn;
  return (
    <ProviderTip type={r.type} render={<div className={cn(
      "flex h-full w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 transition-[border-color,box-shadow]",
      failed ? cn("bg-danger-soft/50 hover:border-danger", blocked ? "border-dashed border-danger/30" : "border-danger/40") : "border-line-strong bg-surface hover:border-fg",
      // A ring as well as the border, so a node reads as picked out even among failed (red-bordered) ones.
      lit && (failed ? "border-danger shadow-[0_0_0_3px_color-mix(in_srgb,var(--av-danger)_20%,transparent)]" : "border-fg shadow-[0_0_0_3px_color-mix(in_srgb,var(--av-fg)_14%,transparent)]")
    )} />}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
      <ResourceIcon type={r.type} size={26} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{r.logicalId}</div>
        <div className="truncate text-[11.5px] text-fg-subtle">{typeLabel(r.type).name}</div>
      </div>
      {failed
        ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-danger" title={blocked ? `Blocked by ${r.failedBy}` : r.error ?? "Failed"} />
        : modeOf(r) === "local" && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-ok" title="Running locally" />}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-strong" />
    </ProviderTip>
  );
}

const nodeTypes = { resource: ResourceNodeView };

function graphEdges(resources: ResourceInfo[]): Edge[] {
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
}

/** What a layout depends on: the resources and how they connect, not their status. */
function graphShape(resources: ResourceInfo[]) {
  return JSON.stringify([resources.map(r => r.fqn), resources.flatMap(r => r.downstream.map(d => `${r.fqn}->${d}`))]);
}

export interface GraphLayout {
  /** The shape this layout is for. */
  shape: string,
  positions: Record<string, { x: number, y: number }>,
  height: number
}

async function layoutGraph(resources: ResourceInfo[]): Promise<GraphLayout> {
  const edges = graphEdges(resources);
  const layout = await elk.layout({
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
  });
  return {
    shape: graphShape(resources),
    positions: Object.fromEntries((layout.children ?? []).map(c => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])),
    height: (layout as { height?: number }).height ?? 0
  };
}

/**
 * The layout is a query so it is computed once per shape and kept: the page
 * can wait for it before it paints (the graph's height is known up front, so
 * nothing below it moves), and coming back to the overview has it already.
 */
export function graphLayoutQuery(resources: ResourceInfo[]) {
  return queryOptions({
    queryKey: ["graph-layout", graphShape(resources)],
    queryFn: () => layoutGraph(resources),
    staleTime: Infinity
  });
}

/** The layout for these resources; undefined until it is ready. Keeps the last one while a changed graph lays out. */
export function useGraphLayout(resources: ResourceInfo[]) {
  const shape = useMemo(() => graphShape(resources), [resources]);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `shape` captures what the layout reads from `resources`
  const options = useMemo(() => graphLayoutQuery(resources), [shape]);
  return useQuery({ ...options, enabled: resources.length > 0, placeholderData: keepPreviousData }).data;
}

/** Fills its parent: size the parent, and the graph is fitted into whatever room it has. */
export function Graph({ resources, layout, leftInset = 0, highlight }: { resources: ResourceInfo[], layout: GraphLayout, leftInset?: number, /** The fqn of a resource to light up and keep in view. */ highlight?: string }) {
  const navigate = useNavigate();
  const frame = useRef<HTMLDivElement>(null);
  const fitOptions = useMemo(() => fitViewOptions(leftInset), [leftInset]);
  // The layout last fitted to the view; the graph stays hidden until it matches.
  const [fitted, setFitted] = useState<string>();
  const edges = useMemo(() => graphEdges(resources), [resources]);
  const { shape, positions } = layout;

  const nodes = useMemo<ResourceNode[]>(
    () => resources.map(r => ({
      id: r.fqn,
      type: "resource",
      position: positions[r.fqn] ?? { x: 0, y: 0 },
      data: { resource: r },
      width: NODE_W,
      height: NODE_H,
      draggable: false,
      connectable: false,
      selectable: false
    })),
    [resources, positions]
  );

  return (
    <HighlightContext.Provider value={highlight}>
      <div ref={frame} className="h-full [&_.react-flow\_\_attribution]:bg-transparent [&_.react-flow\_\_attribution_a]:text-fg-subtle [&_.react-flow\_\_controls]:overflow-hidden [&_.react-flow\_\_controls]:rounded-md [&_.react-flow\_\_controls]:border [&_.react-flow\_\_controls]:border-line [&_.react-flow\_\_controls-button]:border-line [&_.react-flow\_\_controls-button]:bg-surface [&_.react-flow\_\_controls-button]:fill-fg-muted [&_.react-flow\_\_controls-button:hover]:bg-hover">
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
          onInit={i => requestAnimationFrame(() => void i.fitView(fitOptions).then(() => setFitted(shape)))}
          attributionPosition="bottom-center"
          aria-label="Resource dependency graph"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--av-line)" />
          <Controls showInteractive={false} orientation="horizontal" fitViewOptions={fitOptions} position="top-right" style={{ margin: 24 }} />
          <Reveal fqn={highlight} positions={positions} leftInset={leftInset} frame={frame} />
        </ReactFlow>
      </div>
    </HighlightContext.Provider>
  );
}
