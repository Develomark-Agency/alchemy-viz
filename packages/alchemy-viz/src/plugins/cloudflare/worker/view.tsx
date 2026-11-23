import { ExternalLink, Play, Send, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { type Api, defineView, ResourceLink } from "../../../client/index.tsx";
import type { ResourceInfo, StackInfo } from "../../../types.ts";
import {
  Badge,
  Button,
  CodeBlock,
  CodeEditor,
  type Column,
  DataTable,
  EmptyState,
  ErrorBanner,
  Input,
  KeyValueList,
  languageFor,
  LinkButton,
  Panel,
  Select,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Textarea,
  toast
} from "../../../ui/index.ts";
import type server from "./server.ts";

type WorkerApi = Api<typeof server>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

interface BindingRow {
  name: string,
  type: string,
  value?: string,
  target?: string
}

const typeLabels: Record<string, string> = {
  kv_namespace: "KV",
  d1: "D1",
  r2_bucket: "R2",
  plain_text: "Text",
  secret_text: "Secret",
  json: "JSON",
  service: "Service",
  durable_object_namespace: "Durable Object",
  queue: "Queue",
  workflow: "Workflow"
};

function describeBindings(resource: ResourceInfo, stack: StackInfo): BindingRow[] {
  const rows: BindingRow[] = [];
  for(const b of resource.bindings) {
    const inner = (b.data as { bindings?: Array<Record<string, unknown>> })?.bindings ?? [];
    for(const binding of inner) {
      const { name, type, ...rest } = binding as { name: string, type: string } & Record<string, unknown>;
      // Match the binding's ids (namespaceId, databaseId, bucketName, ...) to a resource in the stack.
      const ids = Object.values(rest).filter((v): v is string => typeof v === "string");
      const target = stack.resources.find(r => r.fqn !== resource.fqn && Object.values(r.attr ?? {}).some(v => typeof v === "string" && ids.includes(v)));
      rows.push({
        name,
        type,
        target: target?.fqn,
        value: target ? undefined : type === "plain_text" ? String(rest.text ?? "") : type === "secret_text" ? "••••••" : ids[0]
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

const bindingColumns: Array<Column<BindingRow>> = [
  { id: "name", header: "Name", size: 180, cell: b => <span className="font-mono text-xs">{b.name}</span> },
  { id: "type", header: "Type", size: 130, cell: b => <Badge>{typeLabels[b.type] ?? b.type}</Badge> },
  {
    id: "value",
    header: "Value",
    size: 280,
    accessor: b => b.target ?? b.value,
    cell: b => (b.target ? <ResourceLink fqn={b.target} className="font-medium text-accent hover:underline" /> : <span className="font-mono text-xs text-fg-muted">{b.value}</span>)
  }
];

export default defineView<typeof server>(({ resource, stack, api }) => {
  const url: string | undefined = resource.attr?.url;
  const crons: string[] = resource.attr?.crons ?? resource.props?.crons ?? [];
  const bindings = useMemo(() => describeBindings(resource, stack), [resource, stack]);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Endpoint"
        actions={url && (
          <LinkButton href={url} size="sm">
            Open
            <ExternalLink />
          </LinkButton>
        )}
      >
        {url
          ? <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent hover:underline">{url}</a>
          : <span className="text-fg-subtle">No URL yet</span>}
      </Panel>

      {url && <RequestTool api={api} />}

      {crons.length > 0 && <CronPanel api={api} crons={crons} />}

      <Panel title={<>Bindings <span className="font-normal text-fg-subtle">{bindings.length}</span></>} flush>
        <DataTable rows={bindings} columns={bindingColumns} getRowId={b => b.name} empty="No bindings" />
      </Panel>
    </div>
  );
});

function CronPanel({ api, crons }: { api: WorkerApi, crons: string[] }) {
  const trigger = api.trigger.useMutation({
    onSuccess: (r, input) => toast(r.status < 400 ? "Cron triggered" : `Cron failed (${r.status})`, { description: `${input.cron} · output is in the Logs tab` })
  });
  const columns: Array<Column<{ cron: string }>> = [
    { id: "cron", header: "Schedule", size: 240, cell: c => <span className="font-mono text-xs">{c.cron}</span> },
    {
      id: "run",
      header: "",
      size: 140,
      sortable: false,
      align: "right",
      cell: c => (
        <Button size="sm" onClick={() => trigger.mutateAsync({ cron: c.cron }).catch(() => {})}>
          <Zap />
          Trigger now
        </Button>
      )
    }
  ];
  return (
    <Panel title="Cron triggers" flush>
      <ErrorBanner error={trigger.error} className="m-3" />
      <DataTable rows={crons.map(cron => ({ cron }))} columns={columns} getRowId={c => c.cron} />
    </Panel>
  );
}

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function RequestTool({ api }: { api: WorkerApi }) {
  const [method, setMethod] = useState<Method>("GET");
  const [path, setPath] = useState("/");
  const [body, setBody] = useState("");
  const [headers, setHeaders] = useState("");
  const send = api.request.useMutation();

  function submit() {
    const parsed: Record<string, string> = {};
    for(const line of headers.split("\n")) {
      const i = line.indexOf(":");
      if(i > 0) parsed[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return send.mutateAsync({ method, path, body, headers: parsed }).catch(() => {});
  }

  const res = send.data;
  const contentType = res?.headers["content-type"] ?? "";
  const hasBody = method !== "GET" && method !== "HEAD";

  return (
    <Panel title="Send a request">
      <div className="flex flex-col gap-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={e => {
            e.preventDefault();
            submit();
          }}
        >
          <Select<Method> aria-label="Method" value={method} onValueChange={setMethod} options={METHODS.map(m => ({ value: m, label: m }))} className="w-28 font-mono text-xs" />
          <Input aria-label="Path" value={path} onValueChange={setPath} className="min-w-40 flex-1 font-mono text-xs" />
          <Button variant="primary" type="button" onClick={submit}>
            <Send />
            Send
          </Button>
        </form>
        {hasBody && <CodeEditor aria-label="Request body" value={body} onChange={setBody} onSubmit={submit} language="json" placeholder="Request body" minHeight={90} />}
        <details className="group">
          <summary className="cursor-pointer text-xs text-fg-muted select-none hover:text-fg">Headers</summary>
          <Textarea aria-label="Request headers" className="mt-2" value={headers} onValueChange={setHeaders} placeholder={"content-type: application/json\nx-debug: 1"} rows={3} />
        </details>
        <ErrorBanner error={send.error} />
        {res
          ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <Badge tone={res.status < 300 ? "ok" : res.status < 400 ? "info" : "danger"}>
                  {res.status} {res.statusText}
                </Badge>
                <span className="text-xs text-fg-subtle tabular-nums">{res.durationMs} ms · {contentType || "no content-type"}</span>
              </div>
              <Tabs defaultValue="body">
                <TabsList aria-label="Response">
                  <TabsTab value="body">Body</TabsTab>
                  <TabsTab value="headers">Headers</TabsTab>
                </TabsList>
                <TabsPanel value="body">
                  {res.body
                    ? <CodeBlock code={res.body + (res.truncated ? "\n… (truncated)" : "")} language={languageFor(contentType)} />
                    : <EmptyState title="Empty body" />}
                </TabsPanel>
                <TabsPanel value="headers">
                  <KeyValueList items={Object.entries(res.headers).map(([k, v]) => [<span className="font-mono text-xs">{k}</span>, <span className="font-mono text-xs break-all">{v}</span>])} />
                </TabsPanel>
              </Tabs>
            </div>
          )
          : (
            <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <Play className="size-3" />
              Responses show up here.
            </p>
          )}
      </div>
    </Panel>
  );
}
