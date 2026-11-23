import { Link } from "@tanstack/react-router";
import { Badge, type Column, DataTable, EmptyState, JsonInspector, Page, Panel, StatusPill } from "../../ui/index.ts";
import type { ResourceInfo } from "../../types.ts";
import { Graph } from "./graph.tsx";
import { ResourceIcon } from "./resource-icon.tsx";
import { typeLabel } from "./type-label.ts";
import { useStack } from "./use-stack.ts";

const columns: Array<Column<ResourceInfo>> = [
  {
    id: "fqn",
    header: "Resource",
    size: 260,
    cell: r => (
      <Link to="/r/$fqn" params={{ fqn: r.fqn }} className="inline-flex items-center gap-2 font-medium hover:underline">
        <ResourceIcon type={r.type} size={18} />
        {r.fqn}
      </Link>
    )
  },
  { id: "type", header: "Type", size: 200, accessor: r => typeLabel(r.type).name, cell: r => <span className="text-fg-muted" title={r.type}>{typeLabel(r.type).name}</span> },
  {
    id: "mode",
    header: "Runs",
    size: 110,
    accessor: r => r.mode ?? "",
    cell: r => (r.mode === "local" ? <Badge tone="info">local</Badge> : r.mode === "live" ? <Badge tone="warn">cloud</Badge> : <span className="text-fg-subtle">—</span>)
  },
  { id: "status", header: "Status", size: 130, cell: r => <StatusPill status={r.status} /> },
  { id: "deps", header: "Used by", size: 100, align: "right", accessor: r => r.downstream.length }
];

export function OverviewPage() {
  const stack = useStack().data!.stack;
  const local = stack.resources.filter(r => r.mode === "local").length;

  return (
    <Page title={stack.name} badges={<Badge tone="accent">{stack.stage}</Badge>} subtitle={`${stack.resources.length} resources · ${local} running locally`}>
      {stack.resources.length === 0 ? (
        <Panel>
          <EmptyState title="No resources in this stage yet">
            Start <code className="font-mono text-xs">alchemy dev</code> in this project. Resources show up here as soon as they're created.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <Panel title="Graph" flush>
            <Graph resources={stack.resources} />
          </Panel>
          <Panel title="Resources" flush>
            <DataTable rows={stack.resources} columns={columns} getRowId={r => r.fqn} />
          </Panel>
        </>
      )}
      {stack.output !== null && stack.output !== undefined && (
        <Panel title="Stack output">
          <JsonInspector value={stack.output} label="Stack output" />
        </Panel>
      )}
    </Page>
  );
}
