import { useState } from "react";
import { type Api, defineView, ResourceLink } from "../../../client/index.tsx";
import type { ResourceInfo, StackInfo } from "../../../types.ts";
import {
  Badge,
  Button,
  Code,
  CodeEditor,
  DataTable,
  EmptyState,
  ErrorBanner,
  Input,
  JsonInspector,
  LinkButton,
  Panel,
  prettyText,
  Row,
  Select,
  Stack,
  Tabs
} from "../../../ui/index.ts";
import type server from "./server.ts";

type WorkerApi = Api<typeof server>;

interface BindingRow {
  name: string,
  type: string,
  value?: string,
  target?: string
}

function describeBindings(resource: ResourceInfo, stack: StackInfo): BindingRow[] {
  const rows: BindingRow[] = [];
  for(const b of resource.bindings) {
    const inner = (b.data as { bindings?: Array<Record<string, unknown>> })?.bindings ?? [];
    for(const binding of inner) {
      const { name, type, ...rest } = binding as { name: string, type: string } & Record<string, unknown>;
      // Match the binding's ids (namespaceId, databaseId, bucketName, ...) to a resource in the stack.
      const ids = Object.values(rest).filter((v): v is string => typeof v === "string");
      const target = stack.resources.find(
        r => r.fqn !== resource.fqn && Object.values(r.attr ?? {}).some(v => typeof v === "string" && ids.includes(v))
      );
      rows.push({
        name,
        type,
        target: target?.fqn,
        value: target ? undefined : type === "plain_text" ? String(rest.text ?? "") : type === "secret_text" ? "•••••" : ids[0]
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const typeLabels: Record<string, string> = {
  kv_namespace: "KV",
  d1: "D1",
  r2_bucket: "R2",
  plain_text: "Text",
  secret_text: "Secret",
  service: "Service",
  durable_object_namespace: "Durable Object",
  queue: "Queue"
};

export default defineView<typeof server>(({ resource, stack, api }) => {
  const url: string | undefined = resource.attr?.url;
  const crons: string[] = resource.attr?.crons ?? resource.props?.crons ?? [];
  const bindings = describeBindings(resource, stack);

  return (
    <Stack gap={16}>
      <Panel
        title="Endpoint"
        actions={url ? <LinkButton href={url} size="sm">Open</LinkButton> : undefined}
      >
        {url ? <a href={url} target="_blank" rel="noreferrer" className="av-mono">{url}</a> : <span className="av-muted">No URL yet</span>}
      </Panel>

      <RequestTool api={api} />

      {crons.length > 0 && <CronPanel api={api} crons={crons} />}

      <Panel title={`Bindings (${bindings.length})`} flush>
        <DataTable
          rows={bindings}
          rowKey={b => b.name}
          empty="No bindings"
          columns={[
            { key: "name", header: "Name", render: b => <span className="av-mono">{b.name}</span> },
            { key: "type", header: "Type", render: b => <Badge>{typeLabels[b.type] ?? b.type}</Badge> },
            {
              key: "target",
              header: "Value",
              render: b => (b.target ? <ResourceLink fqn={b.target} /> : <span className="av-mono">{b.value}</span>)
            }
          ]}
        />
      </Panel>
    </Stack>
  );
});

function CronPanel({ api, crons }: { api: WorkerApi, crons: string[] }) {
  const trigger = api.trigger.useMutation();
  const [last, setLast] = useState<{ cron: string, status: number, body: string, at: string }>();
  return (
    <Panel title="Cron triggers" flush>
      <DataTable
        rows={crons}
        rowKey={c => c}
        columns={[
          { key: "cron", header: "Schedule", render: c => <span className="av-mono">{c}</span> },
          {
            key: "run",
            header: "",
            align: "right",
            render: c => (
              <Button
                size="sm"
                loading={trigger.pending}
                onClick={async () => {
                  const r = await trigger.run({ cron: c });
                  setLast({ cron: c, ...r });
                }}
              >
                Trigger now
              </Button>
            )
          }
        ]}
      />
      {(last || trigger.error) && (
        <div style={{ padding: 12, borderTop: "1px solid var(--av-border)" }}>
          <ErrorBanner error={trigger.error} />
          {last && (
            <span style={{ fontSize: 13 }}>
              Ran <span className="av-mono">{last.cron}</span> at {new Date(last.at).toLocaleTimeString()}:{" "}
              <Badge tone={last.status < 400 ? "ok" : "danger"}>{last.status}</Badge>{" "}
              <span className="av-muted">Output appears in the Logs tab.</span>
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function RequestTool({ api }: { api: WorkerApi }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/");
  const [body, setBody] = useState("");
  const [headers, setHeaders] = useState("");
  const [tab, setTab] = useState<"body" | "headers">("body");
  const send = api.request.useMutation();

  function submit() {
    const parsed: Record<string, string> = {};
    for(const line of headers.split("\n")) {
      const i = line.indexOf(":");
      if(i > 0) parsed[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    send.run({ method, path, body, headers: parsed }).catch(() => {});
  }

  const res = send.data;
  const contentType = res?.headers["content-type"] ?? "";
  return (
    <Panel title="Send a request">
      <Stack gap={12}>
        <Row gap={8} align="stretch">
          <Select value={method} onChange={e => setMethod(e.target.value)} options={METHODS} aria-label="Method" />
          <Input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            className="av-mono"
            style={{ flex: 1, minWidth: 160 }}
            aria-label="Path"
          />
          <Button variant="primary" onClick={submit} loading={send.pending}>
            Send
          </Button>
        </Row>
        {method !== "GET" && method !== "HEAD" && (
          <CodeEditor value={body} onChange={setBody} onSubmit={submit} rows={4} placeholder="Request body" />
        )}
        <details>
          <summary className="av-muted" style={{ cursor: "pointer", fontSize: 13 }}>
            Headers
          </summary>
          <div style={{ marginTop: 8 }}>
            <CodeEditor value={headers} onChange={setHeaders} rows={3} placeholder={"content-type: application/json\nx-debug: 1"} />
          </div>
        </details>
        <ErrorBanner error={send.error} />
        {res && (
          <Stack gap={8}>
            <Row gap={8}>
              <Badge tone={res.status < 300 ? "ok" : res.status < 400 ? "info" : "danger"}>
                {res.status} {res.statusText}
              </Badge>
              <span className="av-muted" style={{ fontSize: 12 }}>
                {res.durationMs} ms · {contentType || "no content-type"}
              </span>
            </Row>
            <Tabs
              items={[
                { key: "body", label: "Body" },
                { key: "headers", label: "Headers", count: Object.keys(res.headers).length }
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === "body" ? (
              res.body ? (
                <Code>
                  {contentType.includes("json") ? prettyText(res.body) : res.body}
                  {res.truncated && "\n… (truncated)"}
                </Code>
              ) : (
                <EmptyState title="Empty body" />
              )
            ) : (
              <JsonInspector value={res.headers} />
            )}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}
