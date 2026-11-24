import { Check, CircleAlert, Clock, Hourglass, Pause, Play, Plus, RotateCcw, Send, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Button,
  cn,
  CodeEditor,
  type Column,
  ConfirmButton,
  CopyButton,
  DataTable,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Disclosure,
  EmptyState,
  ErrorBanner,
  Field,
  FieldDescription,
  FieldLabel,
  formatRelative,
  Input,
  JsonInspector,
  KeyValueList,
  Loading,
  Panel,
  Spinner,
  Split,
  Status,
  toast,
  type Tone
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { InstanceStatus, InstanceSummary, Step } from "./server.ts";

type WorkflowApi = Api<typeof server>;

const statusTone: Record<InstanceStatus, Tone> = {
  queued: "neutral",
  running: "info",
  waiting: "info",
  waitingForPause: "warn",
  paused: "warn",
  errored: "danger",
  terminated: "neutral",
  complete: "ok",
  unknown: "neutral"
};

const statusLabel: Partial<Record<InstanceStatus, string>> = { waitingForPause: "pausing" };

function InstanceState({ status }: { status: InstanceStatus }) {
  return <Status tone={statusTone[status]} live={active(status)}>{statusLabel[status] ?? status}</Status>;
}

function active(s: InstanceStatus) {
  return s === "queued" || s === "running" || s === "waiting" || s === "waitingForPause";
}

function duration(start?: string, end?: string) {
  if(!start) return "—";
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if(ms < 1000) return `${ms} ms`;
  if(ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

const columns: Array<Column<InstanceSummary>> = [
  { id: "id", header: "Instance", size: 150, cell: i => <span className="truncate font-mono text-xs" title={i.id}>{i.id}</span> },
  { id: "status", header: "Status", size: 110, accessor: i => i.status, cell: i => <InstanceState status={i.status} /> },
  { id: "steps", header: "Steps", size: 70, align: "right", accessor: i => i.steps.done, cell: i => <span className="text-xs tabular-nums text-fg-muted">{i.steps.done}/{i.steps.total}</span> },
  { id: "created", header: "Created", size: 80, align: "right", accessor: i => i.created, cell: i => <span className="text-xs text-fg-muted" title={new Date(i.created).toLocaleString()}>{formatRelative(i.created)}</span> }
];

export default defineView<typeof server>(({ api, resource }) => {
  const [selected, setSelected] = useUrlState("instance");
  const [creating, setCreating] = useState(false);
  const instances = api.instances.useQuery(undefined, {
    refetchInterval: q => (q.state.data?.some(i => active(i.status)) ? 1000 : 4000)
  });

  return (
    <>
      <Split
        leftWidth={420}
        sticky="left"
        left={(
          <Panel
            title={<>Instances {instances.data && <span className="font-normal text-fg-subtle tabular-nums">{instances.data.length}</span>}</>}
            actions={(
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                New instance
              </Button>
            )}
            flush
          >
            <DataTable
              rows={instances.data}
              columns={columns}
              getRowId={i => i.id}
              loading={instances.isPending}
              error={instances.error}
              selectedId={selected}
              onRowClick={i => setSelected(i.id)}
              empty="No instances yet. Start one here, or from your Worker with create()."
            />
            <div className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
              Class <span className="font-mono text-fg-muted">{resource.attr?.className}</span>
            </div>
          </Panel>
        )}
        right={selected
          ? <InstanceDetail key={selected} api={api} id={selected} />
          : (
            <div className="rounded-lg border border-dashed border-line">
              <EmptyState title="Select an instance">Pick an instance to follow its steps.</EmptyState>
            </div>
          )}
      />
      <NewInstanceDialog api={api} open={creating} onOpenChange={setCreating} onCreated={setSelected} />
    </>
  );
});

function InstanceDetail({ api, id }: { api: WorkflowApi, id: string }) {
  const detail = api.instance.useQuery({ id }, {
    refetchInterval: q => (q.state.data && !active(q.state.data.status) ? 5000 : 1000)
  });
  const action = api.action.useMutation({
    onSuccess: r => toast(`Instance ${r.status}`, { description: id })
  });
  const [sendingEvent, setSendingEvent] = useState(false);

  if(detail.error) return <ErrorBanner error={detail.error} />;
  if(detail.data === undefined) return <Panel><Loading /></Panel>;
  if(detail.data === null) {
    return (
      <Panel>
        <EmptyState title="Instance not found">The engine hasn't stored it yet, or it was removed.</EmptyState>
      </Panel>
    );
  }
  const d = detail.data;
  function run(kind: "pause" | "resume" | "terminate" | "restart") {
    action.mutate({ id, action: kind });
  }
  const waitingForEvent = d.timeline.some(s => s.type === "waitForEvent" && s.status === "waiting");

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={(
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs" title={d.id}>{d.id}</span>
            <CopyButton text={d.id} label="Copy instance id" />
            <InstanceState status={d.status} />
          </span>
        )}
        actions={(
          <>
            {waitingForEvent && (
              <Button size="sm" onClick={() => setSendingEvent(true)}>
                <Send />
                Send event
              </Button>
            )}
            {(d.status === "running" || d.status === "waiting" || d.status === "queued") && (
              <Button size="sm" onClick={() => run("pause")} disabled={action.isPending}>
                <Pause />
                Pause
              </Button>
            )}
            {d.status === "paused" && (
              <Button size="sm" onClick={() => run("resume")} disabled={action.isPending}>
                <Play />
                Resume
              </Button>
            )}
            <Button size="sm" onClick={() => run("restart")} disabled={action.isPending}>
              <RotateCcw />
              Restart
            </Button>
            {active(d.status) || d.status === "paused"
              ? (
                <ConfirmButton
                  title="Terminate this instance?"
                  description="It stops where it is and can't be resumed, only restarted from the beginning."
                  confirmLabel="Terminate"
                  onConfirm={() => action.mutateAsync({ id, action: "terminate" })}
                  trigger={<Button size="sm" variant="danger"><Square />Terminate</Button>}
                />
              )
              : null}
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <ErrorBanner error={action.error} />
          {d.error && <ErrorBanner error={d.error} />}
          <KeyValueList
            items={[
              ["Created", new Date(d.created).toLocaleString()],
              ["Started", d.started ? new Date(d.started).toLocaleString() : "Not yet"],
              ["Ended", d.ended ? new Date(d.ended).toLocaleString() : "—"],
              ["Duration", duration(d.started, d.ended)]
            ]}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1.5 text-[11px] font-medium text-fg-subtle">Params</div>
              {d.params === undefined
                ? <span className="text-xs text-fg-subtle">None</span>
                : <JsonInspector value={d.params} label="params" />}
            </div>
            <div className="min-w-0">
              <div className="mb-1.5 text-[11px] font-medium text-fg-subtle">Output</div>
              {d.output === undefined
                ? <span className="text-xs text-fg-subtle">{d.status === "complete" ? "Nothing returned" : "Not finished"}</span>
                : <JsonInspector value={d.output} label="output" />}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title={<>Steps <span className="font-normal text-fg-subtle tabular-nums">{d.steps.done}/{d.steps.total}</span></>}>
        {d.timeline.length === 0
          ? <p className="text-[13px] text-fg-subtle">{d.status === "queued" ? "Waiting to start." : "No steps yet."}</p>
          : (
            <ol className="flex flex-col">
              {d.timeline.map((step, i) => <StepRow key={`${step.name}-${i}`} step={step} last={i === d.timeline.length - 1} />)}
            </ol>
          )}
      </Panel>
      <SendEventDialog api={api} id={id} open={sendingEvent} onOpenChange={setSendingEvent} />
    </div>
  );
}

function StepIcon({ step }: { step: Step }) {
  const ring = "flex size-6 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5";
  if(step.status === "errored") return <span className={cn(ring, "border-danger/40 text-danger")}><CircleAlert /></span>;
  if(step.status === "complete") return <span className={cn(ring, "border-ok/40 text-ok")}><Check /></span>;
  if(step.type === "sleep") return <span className={cn(ring, "border-line-strong text-fg-muted")}><Hourglass /></span>;
  if(step.type === "waitForEvent") return <span className={cn(ring, "border-line-strong text-fg-muted")}><Clock /></span>;
  return <span className={cn(ring, "border-info/40 text-info")}><Spinner className="size-3" /></span>;
}

function StepRow({ step, last }: { step: Step, last: boolean }) {
  const kind = step.type === "do" ? null : step.type === "sleep" ? "sleep" : "wait for event";
  const failedAttempts = step.attempts.filter(a => a.error);
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span aria-hidden className="absolute top-7 bottom-1 left-3 w-px bg-line" />}
      <StepIcon step={step} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium">{step.name}</span>
          {kind && <span className="text-xs text-fg-subtle">{kind}{step.detail && `, ${step.detail}`}</span>}
          <span className="ml-auto text-xs tabular-nums text-fg-subtle">{duration(step.start, step.end)}</span>
        </div>
        {step.attempts.length > 1 && (
          <span className="text-xs text-warn">{step.attempts.length} attempts{failedAttempts.length ? `, ${failedAttempts.length} failed` : ""}</span>
        )}
        {step.error && <span className="text-xs text-danger">{step.error}</span>}
        {failedAttempts.length > 0 && !step.error && (
          <Disclosure label="Attempt errors">
            <ul className="mt-1 flex flex-col gap-1 text-xs text-fg-muted">
              {failedAttempts.map((a, i) => <li key={i} className="font-mono">{a.error}</li>)}
            </ul>
          </Disclosure>
        )}
        {step.result !== undefined && (
          <Disclosure label="Result">
            <JsonInspector value={step.result} label="result" className="mt-1" />
          </Disclosure>
        )}
      </div>
    </li>
  );
}

function NewInstanceDialog({ api, open, onOpenChange, onCreated }: { api: WorkflowApi, open: boolean, onOpenChange: (open: boolean) => void, onCreated: (id: string) => void }) {
  const [params, setParams] = useState("{\n  \n}");
  const [id, setId] = useState("");
  const create = api.create.useMutation();
  useEffect(() => {
    if(open) create.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    try {
      const r = await create.mutateAsync({ params, id: id || undefined });
      toast("Instance started", { description: r.id });
      onCreated(r.id);
      setId("");
      onOpenChange(false);
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New instance</DialogTitle>
        <DialogBody>
          <Field>
            <FieldLabel>Params</FieldLabel>
            <CodeEditor aria-label="Params" value={params} onChange={setParams} onSubmit={submit} language="json" minHeight={140} />
            <FieldDescription>JSON passed to run() as event.payload.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Instance id</FieldLabel>
            <Input value={id} onValueChange={setId} placeholder="Generated" className="font-mono text-xs" />
          </Field>
          <ErrorBanner error={create.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            <Play />
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendEventDialog({ api, id, open, onOpenChange }: { api: WorkflowApi, id: string, open: boolean, onOpenChange: (open: boolean) => void }) {
  const [type, setType] = useState("");
  const [payload, setPayload] = useState("");
  const send = api.sendEvent.useMutation();

  async function submit() {
    try {
      await send.mutateAsync({ id, type, payload });
      toast("Event sent", { description: type });
      onOpenChange(false);
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Send event</DialogTitle>
        <DialogBody>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Input value={type} onValueChange={setType} autoFocus className="font-mono text-xs" />
            <FieldDescription>Matches the type the step waits for.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Payload</FieldLabel>
            <CodeEditor aria-label="Payload" value={payload} onChange={setPayload} onSubmit={submit} language="json" minHeight={100} />
          </Field>
          <ErrorBanner error={send.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!type || send.isPending}>
            <Send />
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
