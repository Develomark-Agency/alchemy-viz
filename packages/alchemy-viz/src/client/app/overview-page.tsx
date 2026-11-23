import type { StackInfo } from "../../types.ts";
import { Badge, DataTable, EmptyState, JsonInspector, Page, Panel, StatusPill } from "../../ui/index.ts";
import { ResourceLink } from "../index.tsx";
import { Graph } from "./graph.tsx";
import { typeLabel } from "./type-label.ts";

export function OverviewPage({ stack, navigate }: { stack: StackInfo, navigate: (p: string) => void }) {
  const local = stack.resources.filter(r => r.mode === "local").length;
  return (
    <Page
      title={stack.name}
      badges={<Badge tone="accent">{stack.stage}</Badge>}
      subtitle={`${stack.resources.length} resources · ${local} running locally`}
    >
      {stack.resources.length === 0 ? (
        <Panel>
          <EmptyState title="No resources in this stage yet">
            Start <code>alchemy dev</code> in this project. Resources appear here as soon as they're created.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <Panel title="Graph" flush>
            <Graph resources={stack.resources} navigate={navigate} />
          </Panel>
          <Panel title="Resources" flush>
            <DataTable
              rows={stack.resources}
              rowKey={r => r.fqn}
              columns={[
                { key: "fqn", header: "Resource", render: r => <ResourceLink fqn={r.fqn} /> },
                { key: "type", header: "Type", render: r => <span title={r.type}>{typeLabel(r.type).name}</span> },
                {
                  key: "mode",
                  header: "Runs",
                  render: r => r.mode === "local" ? <Badge tone="info">local</Badge> : r.mode === "live" ? <Badge tone="warn">cloud</Badge> : <span className="av-muted">—</span>
                },
                { key: "status", header: "Status", render: r => <StatusPill status={r.status} /> }
              ]}
            />
          </Panel>
        </>
      )}
      {stack.output !== null && stack.output !== undefined && (
        <Panel title="Stack output">
          <JsonInspector value={stack.output} />
        </Panel>
      )}
    </Page>
  );
}
