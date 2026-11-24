import { ArrowRight, Send } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { type Api, defineView, ResourceLink } from "../../../client/index.tsx";
import {
  Banner,
  Button,
  CodeEditor,
  ErrorBanner,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  KeyValueList,
  Loading,
  type LogEntry,
  LogView,
  Panel,
  SegmentedControl,
  toast
} from "../../../ui/index.ts";
import type server from "./server.ts";

const EXAMPLE = JSON.stringify({ kind: "email", payload: { to: "ada@example.com" } }, null, 2);

function seconds(value: unknown) {
  if(typeof value !== "number") return "—";
  if(value === 0) return "None";
  if(value % 86_400 === 0) return `${value / 86_400} day${value === 86_400 ? "" : "s"}`;
  if(value % 3600 === 0) return `${value / 3600} h`;
  if(value % 60 === 0) return `${value / 60} min`;
  return `${value} s`;
}

export default defineView<typeof server>(({ resource, api }) => {
  const overview = api.overview.useQuery();
  // Only lines from after the view opened: the consumer's history is on its Logs tab.
  const [since] = useState(() => Date.now() - 5 * 60_000);
  const activity = api.activity.useQuery({ since }, { refetchInterval: 1500 });
  const lines = useMemo<LogEntry[] | undefined>(
    () => activity.data?.map(l => ({ time: l.time, level: l.level, message: l.message, stream: l.stream, source: l.fqn })),
    [activity.data]
  );
  const a = resource.attr ?? {};
  const consumers = overview.data?.consumers ?? [];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        {a.deliveryPaused && <Banner tone="warn">Delivery is paused. Messages are accepted but not handed to consumers.</Banner>}
        {overview.data && consumers.length === 0 && (
          <Banner tone="warn">No consumer reads this queue, so messages sent here are dropped in local dev.</Banner>
        )}
        <SendPanel api={api} />
        <Panel title="Consumer activity" flush>
          <ErrorBanner error={activity.error} className="m-3" />
          <LogView
            lines={lines}
            maxHeight={360}
            empty={consumers.length ? "Logs from the consuming Worker appear here as it handles messages." : "No consumer"}
          />
        </Panel>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Settings">
          <KeyValueList
            items={[
              ["Name", <span key="n" className="font-mono text-xs break-all">{a.queueName}</span>],
              ["Retention", seconds(a.messageRetentionPeriod)],
              ["Delivery delay", seconds(a.deliveryDelay)],
              ["Delivery", a.deliveryPaused ? "Paused" : "Active"]
            ]}
          />
        </Panel>
        <Panel title="Wiring">
          {!overview.data
            ? <Loading />
            : (
              <div className="flex flex-col gap-4 text-[13px]">
                <Wire title="Producers" empty="No Worker in this stack sends to it.">
                  {overview.data.producers.map(fqn => <ResourceLink key={fqn} fqn={fqn} className="font-mono text-xs hover:underline" />)}
                </Wire>
                <Wire title="Consumers" empty="No consumer.">
                  {consumers.map(c => (
                    <div key={c.fqn} className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <ResourceLink fqn={c.fqn} className="font-mono text-xs hover:underline" />
                        <ArrowRight className="size-3 text-fg-subtle" />
                        {c.worker
                          ? <ResourceLink fqn={c.worker} className="font-mono text-xs hover:underline" />
                          : <span className="font-mono text-xs text-fg-muted">{c.scriptName}</span>}
                      </span>
                      <span className="text-xs text-fg-subtle">
                        {Object.entries(c.settings).map(([k, v]) => `${k} ${v}`).join(", ") || "Default settings"}
                        {c.deadLetterQueue && `, dead letters to ${c.deadLetterQueue}`}
                      </span>
                    </div>
                  ))}
                </Wire>
                {overview.data.deadLetterFor.length > 0 && (
                  <Wire title="Dead-letter queue for" empty="">
                    {overview.data.deadLetterFor.map(fqn => <ResourceLink key={fqn} fqn={fqn} className="font-mono text-xs hover:underline" />)}
                  </Wire>
                )}
              </div>
            )}
        </Panel>
        <p className="px-1 text-xs text-fg-subtle">
          Local queues hand messages straight to their consumer and keep no backlog, so there's nothing to browse. Send one and watch the consumer pick it up.
        </p>
      </div>
    </div>
  );
});

function Wire({ title, empty, children }: { title: string, empty: string, children: ReactNode[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-fg-subtle">{title}</span>
      {children.length ? children : <span className="text-xs text-fg-subtle">{empty}</span>}
    </div>
  );
}

type ContentType = "json" | "text";

function SendPanel({ api }: { api: Api<typeof server> }) {
  const [contentType, setContentType] = useState<ContentType>("json");
  const [body, setBody] = useState(EXAMPLE);
  const [delay, setDelay] = useState("");
  const [copies, setCopies] = useState("1");
  const send = api.send.useMutation({
    onSuccess: r => toast(r.sent === 1 ? "Message sent" : `${r.sent} messages sent`, {
      description: r.consumers ? "Delivered to the queue's consumer." : "No consumer is attached, so it was dropped."
    })
  });

  function submit() {
    send.mutate({ body, contentType, delaySeconds: delay ? Number(delay) : undefined, copies: Number(copies) || 1 });
  }

  return (
    <Panel
      title="Send a message"
      actions={(
        <SegmentedControl<ContentType>
          aria-label="Content type"
          value={contentType}
          onValueChange={setContentType}
          options={[{ value: "json", label: "JSON" }, { value: "text", label: "Text" }]}
        />
      )}
    >
      <div className="flex flex-col gap-4">
        <CodeEditor aria-label="Message body" value={body} onChange={setBody} onSubmit={submit} language={contentType === "json" ? "json" : "text"} minHeight={120} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Delay</FieldLabel>
            <Input type="number" min={0} max={86400} value={delay} onValueChange={setDelay} placeholder="None" />
            <FieldDescription>Seconds before it's delivered.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Copies</FieldLabel>
            <Input type="number" min={1} max={100} value={copies} onValueChange={setCopies} />
            <FieldDescription>Sent as one batch.</FieldDescription>
          </Field>
        </div>
        <ErrorBanner error={send.error} />
        <div className="flex justify-end">
          <Button variant="primary" onClick={submit} disabled={send.isPending}>
            <Send />
            Send
          </Button>
        </div>
      </div>
    </Panel>
  );
}
