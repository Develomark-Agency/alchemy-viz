import { useEffect, useState } from "react";
import { type Api as ViewApi, defineView } from "../../../client/index.tsx";
import {
  ActionButton,
  Banner,
  Button,
  CodeEditor,
  EmptyState,
  ErrorBanner,
  Field,
  formatBytes,
  Input,
  JsonInspector,
  KeyValueList,
  Loading,
  Modal,
  Panel,
  prettyText,
  Row,
  Split,
  Stack
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { KvKey } from "./server.ts";

function parseMetadata(text: string) {
  if(!text.trim()) return undefined;
  return JSON.parse(text);
}

export default defineView<typeof server>(({ api }) => {
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<string>();
  const [creating, setCreating] = useState(false);
  const first = api.list.useQuery({ prefix });
  const [extra, setExtra] = useState<{ keys: KvKey[], cursor?: string }>({ keys: [] });
  const [loadingMore, setLoadingMore] = useState(false);

  // A fresh first page (new prefix, or a write) resets pagination.
  useEffect(() => setExtra({ keys: [], cursor: undefined }), [first.data]);

  const keys = [...(first.data?.keys ?? []), ...extra.keys];
  const cursor = extra.keys.length ? extra.cursor : first.data?.cursor;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await api.list.call({ prefix, cursor });
      setExtra(e => ({ keys: [...e.keys, ...page.keys], cursor: page.cursor }));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Split
        leftWidth={340}
        left={
          <Panel
            title={`Keys${first.data ? ` (${keys.length}${cursor ? "+" : ""})` : ""}`}
            actions={
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                New key
              </Button>
            }
            flush
          >
            <div style={{ padding: 10, borderBottom: "1px solid var(--av-border)" }}>
              <Input
                placeholder="Filter by prefix"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                style={{ width: "100%" }}
                aria-label="Key prefix"
              />
            </div>
            {first.error ? (
              <div style={{ padding: 10 }}>
                <ErrorBanner error={first.error} />
              </div>
            ) : !first.data ? (
              <Loading />
            ) : keys.length === 0 ? (
              <EmptyState title={prefix ? "No keys with this prefix" : "This namespace is empty"} />
            ) : (
              <div className="av-list" style={{ maxHeight: 560, overflowY: "auto" }}>
                {keys.map(k => (
                  <button
                    key={k.name}
                    type="button"
                    className="av-list-item"
                    aria-selected={selected === k.name}
                    onClick={() => setSelected(k.name)}
                  >
                    <span className="av-truncate av-mono av-grow">{k.name}</span>
                    {k.metadata != null && <span className="av-muted" style={{ fontSize: 11 }}>meta</span>}
                  </button>
                ))}
              </div>
            )}
            {cursor && (
              <div className="av-table-footer">
                <span />
                <Button size="sm" onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              </div>
            )}
          </Panel>
        }
        right={
          selected ? (
            <KeyDetail key={selected} name={selected} api={api} onDeleted={() => setSelected(undefined)} />
          ) : (
            <Panel>
              <EmptyState title="Select a key">Pick a key on the left to see and edit its value.</EmptyState>
            </Panel>
          )
        }
      />
      <NewKeyModal open={creating} onClose={() => setCreating(false)} api={api} onCreated={k => setSelected(k)} />
    </>
  );
});

type Api = ViewApi<typeof server>;

function KeyDetail({ name, api, onDeleted }: { name: string, api: Api, onDeleted: () => void }) {
  const entry = api.get.useQuery({ key: name });
  const put = api.put.useMutation();
  const del = api.delete.useMutation();
  const [draft, setDraft] = useState<string>();
  const original = entry.data?.value == null ? "" : prettyText(entry.data.value);
  const value = draft ?? original;
  const dirty = draft !== undefined && draft !== original;

  if(entry.error) return <ErrorBanner error={entry.error} />;
  if(!entry.data) return <Loading />;
  if(entry.data.value === null) {
    return (
      <Panel>
        <EmptyState title="Key not found">It may have expired or been deleted.</EmptyState>
      </Panel>
    );
  }

  async function save() {
    // Save the text as typed; pretty-printing is display only, so compact JSON back.
    let out = value;
    try {
      if(entry.data!.value !== null && JSON.stringify(JSON.parse(entry.data!.value)) === entry.data!.value) {
        out = JSON.stringify(JSON.parse(value));
      }
    } catch {}
    await put.run({ key: name, value: out, metadata: entry.data!.metadata ?? undefined });
    setDraft(undefined);
  }

  return (
    <Panel
      title={<span className="av-mono av-truncate">{name}</span>}
      actions={
        <ActionButton
          size="sm"
          variant="danger"
          confirm="Click to delete"
          onAction={async () => {
            await del.run({ key: name });
            onDeleted();
          }}
        >
          Delete
        </ActionButton>
      }
    >
      <Stack gap={14}>
        <KeyValueList items={[["Size", formatBytes(new TextEncoder().encode(entry.data.value).length)]]} />
        <Field label="Value">
          <CodeEditor value={value} onChange={setDraft} onSubmit={dirty ? save : undefined} rows={12} />
        </Field>
        <ErrorBanner error={put.error} />
        <Row justify="flex-end" gap={8}>
          {dirty && <Button onClick={() => setDraft(undefined)}>Discard</Button>}
          <Button variant="primary" disabled={!dirty} loading={put.pending} onClick={save}>
            Save
          </Button>
        </Row>
        {entry.data.metadata != null && (
          <Field label="Metadata">
            <JsonInspector value={entry.data.metadata} />
          </Field>
        )}
      </Stack>
    </Panel>
  );
}

function NewKeyModal({
  open,
  onClose,
  onCreated,
  api
}: {
  open: boolean,
  onClose: () => void,
  onCreated: (key: string) => void,
  api: Api
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [metadata, setMetadata] = useState("");
  const [ttl, setTtl] = useState("");
  const put = api.put.useMutation();
  const [error, setError] = useState<string>();

  async function submit() {
    setError(undefined);
    let meta: unknown;
    try {
      meta = parseMetadata(metadata);
    } catch {
      setError("Metadata must be valid JSON.");
      return;
    }
    await put.run({ key, value, metadata: meta, expirationTtl: ttl ? Number(ttl) : undefined });
    onCreated(key);
    setKey("");
    setValue("");
    setMetadata("");
    setTtl("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New key"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={put.pending} disabled={!key}>
            Create
          </Button>
        </>
      }
    >
      <Field label="Key">
        <Input value={key} onChange={e => setKey(e.target.value)} autoFocus />
      </Field>
      <Field label="Value">
        <CodeEditor value={value} onChange={setValue} rows={6} onSubmit={key ? submit : undefined} />
      </Field>
      <Field label="Metadata (JSON, optional)">
        <Input value={metadata} onChange={e => setMetadata(e.target.value)} placeholder='{"source": "manual"}' />
      </Field>
      <Field label="Expires after (seconds, optional)" hint="Minimum 60.">
        <Input type="number" min={60} value={ttl} onChange={e => setTtl(e.target.value)} />
      </Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <ErrorBanner error={put.error} />
    </Modal>
  );
}
