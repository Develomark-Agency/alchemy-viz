import { Paperclip } from "lucide-react";
import { useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Banner,
  CodeBlock,
  type Column,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatBytes,
  formatRelative,
  KeyValueList,
  Loading,
  Panel,
  SegmentedControl,
  Split
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { SentEmail } from "./server.ts";

type EmailApi = Api<typeof server>;

const columns: Array<Column<SentEmail>> = [
  {
    id: "subject",
    header: "Message",
    size: 260,
    accessor: e => e.subject ?? "",
    cell: e => (
      <span className="flex min-w-0 flex-col py-1">
        <span className="truncate text-[13px]">{e.subject || <span className="text-fg-subtle">(no subject)</span>}</span>
        <span className="truncate text-xs text-fg-subtle">to {e.to ?? "?"}</span>
      </span>
    )
  },
  { id: "time", header: "Sent", size: 80, align: "right", accessor: e => e.time, cell: e => <span className="text-xs text-fg-muted" title={new Date(e.time).toLocaleString()}>{formatRelative(e.time)}</span> }
];

export default defineView<typeof server>(({ api }) => {
  const list = api.list.useQuery(undefined, { refetchInterval: 3000 });
  const [selected, setSelected] = useUrlState("email");

  return (
    <Split
      leftWidth={380}
      sticky="left"
      left={(
        <Panel title={<>Sent {list.data && <span className="font-normal text-fg-subtle tabular-nums">{list.data.length}</span>}</>} flush>
          <DataTable
            rows={list.data}
            columns={columns}
            getRowId={e => e.id}
            loading={list.isPending}
            error={list.error}
            selectedId={selected}
            onRowClick={e => setSelected(e.id)}
            empty="Nothing sent yet. Mail sent through this Worker's send_email bindings shows up here."
          />
          <p className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
            In <code className="font-mono">alchemy dev</code> mail is stored under <code className="font-mono">.alchemy/local/email</code>, not delivered. Listed from recent dev runs' logs.
          </p>
        </Panel>
      )}
      right={selected
        ? <Message key={selected} api={api} id={selected} />
        : (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState title="Select a message">Pick one to read it as the recipient would.</EmptyState>
          </div>
        )}
    />
  );
});

type Mode = "html" | "text" | "raw";

function Message({ api, id }: { api: EmailApi, id: string }) {
  const message = api.message.useQuery({ id });
  const [mode, setMode] = useState<Mode>();

  if(message.error) return <ErrorBanner error={message.error} />;
  if(message.data === undefined) return <Panel><Loading /></Panel>;
  if(message.data === null) {
    return <Panel><EmptyState title="Message not found">It's no longer in the dev logs.</EmptyState></Panel>;
  }
  const m = message.data;
  const modes: Array<{ value: Mode, label: string }> = [
    ...(m.html !== undefined ? [{ value: "html" as const, label: "HTML" }] : []),
    ...(m.text !== undefined ? [{ value: "text" as const, label: "Text" }] : []),
    ...(m.raw !== undefined ? [{ value: "raw" as const, label: "Source" }] : [])
  ];
  const shown = mode && modes.some(x => x.value === mode) ? mode : modes[0]?.value;
  const important = new Set(["from", "to", "cc", "subject", "date", "reply-to"]);

  return (
    <div className="flex flex-col gap-4">
      {m.missing && <Banner tone="warn">Some of this message's files are gone from .alchemy/local/email.</Banner>}
      <Panel
        title={m.headers.find(([k]) => k.toLowerCase() === "subject")?.[1] || "(no subject)"}
        actions={modes.length > 1 && <SegmentedControl<Mode> aria-label="Show" value={shown!} onValueChange={setMode} options={modes} />}
        flush
      >
        <div className="border-b border-line px-4 py-3">
          <KeyValueList items={m.headers.filter(([k]) => important.has(k.toLowerCase()) && k.toLowerCase() !== "subject").map(([k, v]) => [k, <span key={k} className="break-all">{v}</span>])} />
        </div>
        {shown === "html" && (
          // Rendered with scripts, forms and same-origin access off: it's someone's email, shown as a mail client would.
          <iframe title="HTML body" sandbox="" srcDoc={m.html} className="h-[480px] w-full bg-white" />
        )}
        {shown === "text" && <pre className="max-h-[480px] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">{m.text}</pre>}
        {shown === "raw" && <CodeBlock code={m.raw ?? ""} language="text" className="max-h-[480px] rounded-none border-0" />}
        {!shown && <p className="p-4 text-[13px] text-fg-subtle">This message has no body.</p>}
        {m.attachments.length > 0 && (
          <ul className="flex flex-col gap-1 border-t border-line px-4 py-3 text-xs">
            {m.attachments.map(a => (
              <li key={a.path} className="flex items-center gap-2">
                <Paperclip className="size-3.5 text-fg-subtle" />
                <span className="font-mono">{a.name}</span>
                <span className="text-fg-subtle">{a.disposition}{a.size !== undefined && ` · ${formatBytes(a.size)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
