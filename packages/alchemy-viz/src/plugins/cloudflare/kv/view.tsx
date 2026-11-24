import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Badge,
  Button,
  cn,
  CodeEditor,
  type Column,
  ConfirmButton,
  DataTable,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  ErrorBanner,
  Field,
  FieldDescription,
  FieldLabel,
  formatBytes,
  IconButton,
  Input,
  Loading,
  Panel,
  PropertyList,
  SearchInput,
  Split,
  toast,
  toProperties
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { KvKey } from "./server.ts";

type KvApi = Api<typeof server>;

function isJson(text: string) {
  try {
    JSON.parse(text);
    return /^\s*[[{]/.test(text);
  } catch {
    return false;
  }
}

const keyColumns: Array<Column<KvKey>> = [
  { id: "name", header: "Key", size: 240, cell: k => <span className="font-mono text-xs">{k.name}</span> },
  {
    id: "info",
    header: "",
    size: 70,
    sortable: false,
    align: "right",
    accessor: k => (k.metadata != null ? 1 : 0),
    cell: k => (k.metadata != null ? <Badge>meta</Badge> : null)
  }
];

export default defineView<typeof server>(({ api }) => {
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useUrlState("key");
  const [creating, setCreating] = useState(false);
  const pages = api.list.useInfiniteQuery({ prefix }, { getNextCursor: p => p.cursor });
  const keys = useMemo(() => pages.data?.pages.flatMap(p => p.keys), [pages.data]);

  return (
    <>
      <Split
        leftWidth={360}
        left={(
          <Panel
            title={<>Keys {keys && <span className="font-normal text-fg-subtle tabular-nums">{keys.length}{pages.hasNextPage ? "+" : ""}</span>}</>}
            actions={(
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                New key
              </Button>
            )}
            flush
          >
            <div className="border-b border-line p-2">
              <SearchInput aria-label="Filter keys by prefix" placeholder="Filter by prefix" value={prefix} onValueChange={setPrefix} />
            </div>
            <DataTable
              rows={keys}
              columns={keyColumns}
              getRowId={k => k.name}
              loading={pages.isPending}
              error={pages.error}
              selectedId={selected}
              onRowClick={k => setSelected(k.name)}
              empty={prefix ? "No keys with this prefix" : "This namespace is empty"}
              hasMore={pages.hasNextPage}
              loadingMore={pages.isFetchingNextPage}
              onEndReached={() => pages.fetchNextPage()}
              scroll="page"
            />
          </Panel>
        )}
        right={selected
          ? <KeyDetail name={selected} api={api} onDeleted={() => setSelected(undefined)} />
          : (
            // A quiet hint rather than an empty panel the size of a real one.
            <div className="rounded-lg border border-dashed border-line">
              <EmptyState title="Select a key">Pick a key to see and edit its value.</EmptyState>
            </div>
          )}
      />
      <NewKeyDialog open={creating} onOpenChange={setCreating} api={api} onCreated={setSelected} />
    </>
  );
});

function KeyDetail({ name, api, onDeleted }: { name: string, api: KvApi, onDeleted: () => void }) {
  const entry = api.get.useQuery({ key: name });
  const put = api.put.useMutation({ onSuccess: () => toast("Saved", { description: name }) });
  const del = api.delete.useMutation();
  const [draft, setDraft] = useState<string>();
  // One panel serves every key; an unsaved edit belongs to the key it was made on.
  useEffect(() => setDraft(undefined), [name]);
  const stale = entry.isPlaceholderData;

  if(entry.error) return <ErrorBanner error={entry.error} />;
  if(!entry.data) return <Panel><Loading /></Panel>;
  if(entry.data.value === null) {
    return (
      <Panel>
        <EmptyState title="Key not found">It may have expired or been deleted.</EmptyState>
      </Panel>
    );
  }

  const stored = entry.data.value;
  const json = isJson(stored);
  const original = json ? JSON.stringify(JSON.parse(stored), null, 2) : stored;
  const value = draft ?? original;
  const dirty = draft !== undefined && draft !== original;

  async function save() {
    // Pretty-printing is for display; write JSON back as compact as it was stored.
    let out = value;
    if(json && !stored.includes("\n")) {
      try {
        out = JSON.stringify(JSON.parse(value));
      } catch {}
    }
    try {
      await put.mutateAsync({ key: name, value: out, metadata: entry.data?.metadata ?? undefined });
      setDraft(undefined);
    } catch {}
  }

  return (
    <Panel
      className={cn("animate-in fade-in transition-opacity duration-150 ease-out", stale && "opacity-60")}
      title={(
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-xs">{name}</span>
          <span className="shrink-0 text-xs font-normal text-fg-subtle">{json ? "JSON" : "Text"}, {formatBytes(new TextEncoder().encode(stored).length)}</span>
        </span>
      )}
      actions={(
        <ConfirmButton
          title={`Delete ${name}?`}
          description="The key and its value are removed from the local namespace."
          onConfirm={async () => {
            await del.mutateAsync({ key: name });
            toast("Deleted", { description: name });
            onDeleted();
          }}
          trigger={<IconButton label="Delete key" variant="ghost"><Trash2 /></IconButton>}
        />
      )}
    >
      <div className="flex flex-col gap-4">
        <CodeEditor aria-label="Value" value={value} onChange={setDraft} onSubmit={dirty ? save : undefined} language={json ? "json" : "text"} minHeight={160} />
        <ErrorBanner error={put.error} />
        <div className="flex justify-end gap-2">
          {dirty && <Button onClick={() => setDraft(undefined)}>Discard</Button>}
          <Button variant="primary" disabled={!dirty} onClick={save}>
            Save
          </Button>
        </div>
        {entry.data.metadata != null && (
          <PropertyList
            className="-mx-4 -mb-4 border-t border-line"
            sections={[{ title: "Metadata", items: typeof entry.data.metadata === "object" ? toProperties(entry.data.metadata) : [{ key: "value", value: entry.data.metadata }] }]}
          />
        )}
      </div>
    </Panel>
  );
}

function NewKeyDialog({ open, onOpenChange, onCreated, api }: { open: boolean, onOpenChange: (open: boolean) => void, onCreated: (key: string) => void, api: KvApi }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [metadata, setMetadata] = useState("");
  const [ttl, setTtl] = useState("");
  const [metaError, setMetaError] = useState<string>();
  const put = api.put.useMutation();

  async function submit() {
    setMetaError(undefined);
    let meta: unknown;
    if(metadata.trim()) {
      try {
        meta = JSON.parse(metadata);
      } catch {
        return setMetaError("Metadata must be valid JSON.");
      }
    }
    try {
      await put.mutateAsync({ key, value, metadata: meta, expirationTtl: ttl ? Number(ttl) : undefined });
    } catch {
      return;
    }
    toast("Created", { description: key });
    onCreated(key);
    setKey("");
    setValue("");
    setMetadata("");
    setTtl("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={next => onOpenChange(next)}>
      <DialogContent>
        <DialogTitle>New key</DialogTitle>
        <DialogBody>
          <Field>
            <FieldLabel>Key</FieldLabel>
            <Input value={key} onValueChange={setKey} autoFocus className="font-mono text-xs" />
          </Field>
          <Field>
            <FieldLabel>Value</FieldLabel>
            <CodeEditor aria-label="Value" value={value} onChange={setValue} language={isJson(value) ? "json" : "text"} onSubmit={key ? submit : undefined} minHeight={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field invalid={!!metaError}>
              <FieldLabel>Metadata</FieldLabel>
              <Input value={metadata} onValueChange={setMetadata} placeholder={"{\"source\": \"manual\"}"} className="font-mono text-xs" />
              <FieldDescription>Optional JSON.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Expires after</FieldLabel>
              <Input type="number" min={60} value={ttl} onValueChange={setTtl} placeholder="Never" />
              <FieldDescription>Seconds, at least 60.</FieldDescription>
            </Field>
          </div>
          <ErrorBanner error={metaError ?? put.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!key} onClick={submit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
