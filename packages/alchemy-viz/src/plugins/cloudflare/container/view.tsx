import { RefreshCw, Square } from "lucide-react";
import { useMemo } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Banner,
  Button,
  cn,
  type Column,
  ConfirmButton,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatBytes,
  IconButton,
  KeyValueList,
  Loading,
  type LogEntry,
  LogView,
  Panel,
  Split,
  Status,
  toast,
  type Tone
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { ContainerInfo } from "./server.ts";

type ContainerApi = Api<typeof server>;

const stateTone: Record<string, Tone> = { running: "ok", exited: "neutral", removed: "neutral", created: "info", restarting: "warn", paused: "warn", dead: "danger" };

const columns: Array<Column<ContainerInfo>> = [
  {
    id: "object",
    header: "Durable Object",
    size: 170,
    accessor: c => c.objectId ?? c.name,
    cell: c => <span className="truncate font-mono text-xs" title={c.name}>{c.objectId ? `${c.objectId.slice(0, 16)}…` : c.name}</span>
  },
  { id: "state", header: "State", size: 100, accessor: c => c.state, cell: c => <Status tone={stateTone[c.state] ?? "neutral"} live={c.state === "restarting"}>{c.state}</Status> },
  { id: "status", header: "Status", size: 150, cell: c => <span className="text-xs text-fg-muted">{c.status}</span> }
];

export default defineView<typeof server>(({ api, resource }) => {
  const list = api.containers.useQuery(undefined, { refetchInterval: 3000, retry: false });
  const [selected, setSelected] = useUrlState("container");
  const a = resource.attr ?? {};

  if(list.error) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner error={list.error} />
        <Settings attr={a} />
      </div>
    );
  }
  if(!list.data) return <Loading />;
  const current = list.data.containers.find(c => c.id === selected);

  return (
    <div className="flex flex-col gap-4">
      <Split
        leftWidth={440}
        sticky="left"
        left={(
          <div className="flex flex-col gap-4">
            <Panel
              title={<>Instances <span className="font-normal text-fg-subtle tabular-nums">{list.data.containers.length}</span></>}
              actions={(
                <IconButton label="Refresh" onClick={() => list.refetch()}>
                  <RefreshCw className={cn(list.isRefetching && "animate-spin")} />
                </IconButton>
              )}
              flush
            >
              <DataTable
                rows={list.data.containers}
                columns={columns}
                getRowId={c => c.id}
                selectedId={selected}
                onRowClick={c => setSelected(c.id)}
                empty="No containers yet. A Durable Object starts one the first time it needs it."
              />
              <p className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
                One container per Durable Object instance, started by <code className="font-mono">alchemy dev</code> in Docker and removed soon after the object goes idle. Removed ones stay listed here for 15 minutes.
              </p>
            </Panel>
            <Settings attr={a} />
          </div>
        )}
        right={current
          ? <ContainerDetail key={current.id} api={api} container={current} onStopped={() => list.refetch()} />
          : (
            <div className="rounded-lg border border-dashed border-line">
              <EmptyState title="Select a container">Pick one to see its logs and configuration.</EmptyState>
            </div>
          )}
      />
      {list.data.containers.length === 0 && list.data.others > 0 && (
        <Banner>
          {list.data.others} other alchemy dev container{list.data.others === 1 ? " is" : "s are"} running, but none use this Container's image
          {" "}({list.data.classes.map(c => `alchemy-dev/${c}`).join(", ")}).
        </Banner>
      )}
    </div>
  );
});

function Settings({ attr }: { attr: Record<string, any> }) {
  const items: Array<[string, string]> = [];
  if(attr.applicationName) items.push(["Application", String(attr.applicationName)]);
  if(attr.schedulingPolicy) items.push(["Scheduling", String(attr.schedulingPolicy)]);
  if(attr.image) items.push(["Image", String(attr.image)]);
  if(attr.maxInstances !== undefined) items.push(["Max instances", String(attr.maxInstances)]);
  if(attr.configuration?.instance_type) items.push(["Instance type", String(attr.configuration.instance_type)]);
  if(items.length === 0) return null;
  return (
    <Panel title="Configuration">
      <KeyValueList items={items.map(([k, v]) => [k, <span key={k} className="font-mono text-xs break-all">{v}</span>])} />
    </Panel>
  );
}

function ContainerDetail({ api, container, onStopped }: { api: ContainerApi, container: ContainerInfo, onStopped: () => void }) {
  const running = container.state === "running";
  const logs = api.logs.useQuery({ id: container.id }, { refetchInterval: running ? 2000 : false });
  const info = api.inspect.useQuery({ id: container.id });
  const stop = api.stop.useMutation();
  const lines = useMemo<LogEntry[] | undefined>(() => logs.data?.map(l => ({ time: l.time, message: l.message, stream: l.stream, level: l.stream === "stderr" ? "warn" : undefined })), [logs.data]);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={(
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs" title={container.name}>{container.objectId ? `${container.objectId.slice(0, 16)}…` : container.name}</span>
            <Status tone={stateTone[container.state] ?? "neutral"} live={container.state === "restarting"}>{container.state}</Status>
          </span>
        )}
        actions={running && (
          <ConfirmButton
            title="Stop this container?"
            description="Its Durable Object starts a new one the next time it needs it."
            confirmLabel="Stop"
            onConfirm={async () => {
              await stop.mutateAsync({ id: container.id });
              toast("Container stopped", { description: container.name });
              onStopped();
            }}
            trigger={<Button size="sm"><Square />Stop</Button>}
          />
        )}
      >
        {info.error
          ? <ErrorBanner error={info.error} />
          : !info.data
            ? <Loading />
            : (
              <KeyValueList
                items={[
                  ["Durable Object", <span key="o" className="font-mono text-xs break-all">{container.objectId ?? "—"}</span>],
                  ["Image", <span key="i" className="font-mono text-xs break-all">{info.data.image}</span>],
                  ["Command", <span key="c" className="font-mono text-xs break-all">{info.data.cmd.join(" ") || "—"}</span>],
                  ["Started", info.data.startedAt ? new Date(info.data.startedAt).toLocaleString() : "—"],
                  ["Ports", info.data.ports || "—"],
                  ["Limits", [info.data.cpus && `${info.data.cpus} vCPU`, info.data.memory && formatBytes(info.data.memory)].filter(Boolean).join(" · ") || "None"],
                  ["Env", <span key="e" className="font-mono text-xs break-all">{info.data.env.join(", ") || "—"}</span>]
                ]}
              />
            )}
      </Panel>
      <Panel title="Logs" flush>
        <ErrorBanner error={logs.error} className="m-3" />
        <LogView lines={lines} maxHeight={420} empty={container.state === "removed" ? "No output was captured before the container was removed." : "This container hasn't written any output."} />
      </Panel>
    </div>
  );
}
