import { ArrowUpRight, ExternalLink, Play, Send, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { type Api, defineView, ResourceLink } from "../../../client/index.tsx";
import type { ResourceInfo, StackInfo } from "../../../types.ts";
import {
  Badge,
  Button,
  CodeBlock,
  CodeEditor,
  Collapse,
  Disclosure,
  ContentPreview,
  EmptyState,
  ErrorBanner,
  Input,
  KeyValueList,
  languageFor,
  Panel,
  previewKind,
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
  workflow: "Workflow",
  secrets_store_secret: "Secret",
  send_email: "Email"
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

export default defineView<typeof server>(({ resource, stack, api }) => {
  const url: string | undefined = resource.attr?.url;
  const crons: string[] = resource.attr?.crons ?? resource.props?.crons ?? [];
  const bindings = useMemo(() => describeBindings(resource, stack), [resource, stack]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {url
          ? <RequestTool api={api} url={url} />
          : <Panel><EmptyState title="No URL yet">The Worker hasn't reported where it serves. Is alchemy dev running?</EmptyState></Panel>}
      </div>
      {/* Beside the request tool on wide screens; below it, two columns instead of full-width strips. */}
      <aside className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:sticky lg:top-[calc(var(--topbar-h)+16px)] lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4 empty:hidden">
          {url && (
            <Panel title="Endpoint" flush>
              <a href={url} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-hover">
                <span className="truncate font-mono text-xs">{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="size-3.5 shrink-0 text-fg-subtle group-hover:text-fg" />
              </a>
            </Panel>
          )}
          {crons.length > 0 && <CronPanel api={api} crons={crons} />}
        </div>
        <Panel title={<>Bindings <span className="font-normal text-fg-subtle tabular-nums">{bindings.length}</span></>} flush>
          {bindings.length === 0
            ? <EmptyState title="No bindings" />
            : (
              <ul className="divide-y divide-line">
                {bindings.map(b => (
                  <li key={b.name} className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-mono text-xs">{b.name}</span>
                      <span className="text-[11.5px] text-fg-subtle">{typeLabels[b.type] ?? b.type}</span>
                    </span>
                    {b.target
                      ? (
                        <ResourceLink fqn={b.target} className="group inline-flex min-w-0 items-center gap-1 text-[13px] font-medium hover:underline">
                          <span className="truncate">{b.target}</span>
                          <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle group-hover:text-fg" />
                        </ResourceLink>
                      )
                      : <span className="truncate font-mono text-xs text-fg-muted" title={b.value}>{b.value}</span>}
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </aside>
    </div>
  );
});

function CronPanel({ api, crons }: { api: WorkerApi, crons: string[] }) {
  const trigger = api.trigger.useMutation({
    onSuccess: (r, input) => toast(r.status < 400 ? "Cron triggered" : `Cron failed (${r.status})`, { description: `${input.cron} · output is in the Logs tab` })
  });
  return (
    <Panel title="Cron triggers" flush>
      <ErrorBanner error={trigger.error} className="m-3" />
      <ul className="divide-y divide-line">
        {crons.map(cron => (
          <li key={cron} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="font-mono text-xs">{cron}</span>
            <Button size="sm" variant="ghost" onClick={() => trigger.mutateAsync({ cron }).catch(() => {})}>
              <Zap />
              Run now
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

function RequestTool({ api, url }: { api: WorkerApi, url: string }) {
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
          <label className="flex h-8 min-w-48 flex-1 items-center overflow-hidden rounded-md border border-line-strong bg-surface shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
            <span className="h-full content-center border-r border-line bg-surface-2/60 px-2.5 font-mono text-xs text-fg-subtle select-none">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
            <Input aria-label="Path" value={path} onValueChange={setPath} className="h-full flex-1 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0" />
          </label>
          <Button variant="primary" type="button" onClick={submit}>
            <Send />
            Send
          </Button>
        </form>
        {/* The body editor opens and closes with the method instead of popping in; -mt-3 cancels the gap while it's closed. */}
        <div className="-mt-3">
          <Collapse open={hasBody} className="pt-3">
            <CodeEditor aria-label="Request body" value={body} onChange={setBody} onSubmit={submit} language="json" placeholder="Request body" minHeight={90} />
          </Collapse>
        </div>
        <Disclosure label="Headers">
          <Textarea aria-label="Request headers" value={headers} onValueChange={setHeaders} placeholder={"content-type: application/json\nx-debug: 1"} rows={3} />
        </Disclosure>
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
                  {!res.body
                    ? <EmptyState title="Empty body" />
                    : previewKind(contentType) && !res.truncated
                      ? <ContentPreview text={res.body} kind={previewKind(contentType)!} />
                      : <CodeBlock code={res.body + (res.truncated ? "\n… (truncated)" : "")} language={languageFor(contentType)} />}
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
