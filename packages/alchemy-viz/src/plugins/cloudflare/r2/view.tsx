import { useEffect, useRef, useState } from "react";
import { type Api, defineView } from "../../../client/index.tsx";
import {
  ActionButton,
  Button,
  Code,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatBytes,
  formatTime,
  JsonInspector,
  KeyValueList,
  LinkButton,
  Loading,
  Panel,
  Row,
  Split,
  Stack
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { ObjectInfo } from "./server.ts";

type R2Api = Api<typeof server>;
type Entry = { kind: "folder", key: string } | ({ kind: "object" } & ObjectInfo);

const PREVIEW_LIMIT = 512 * 1024;

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for(let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default defineView<typeof server>(({ api }) => {
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<string>();
  const page = api.list.useQuery({ prefix });
  const put = api.put.useMutation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [extra, setExtra] = useState<{ objects: ObjectInfo[], cursor?: string }>({ objects: [] });

  useEffect(() => setExtra({ objects: [] }), [page.data]);

  const cursor = extra.objects.length ? extra.cursor : page.data?.cursor;
  const entries: Entry[] = [
    ...(page.data?.folders ?? []).map((key): Entry => ({ kind: "folder", key })),
    ...[...(page.data?.objects ?? []), ...extra.objects].map((o): Entry => ({ kind: "object", ...o }))
  ];

  const crumbs = prefix.split("/").filter(Boolean);
  function open(p: string) {
    setPrefix(p);
    setSelected(undefined);
  }

  async function upload(files: FileList | null) {
    for(const file of Array.from(files ?? [])) {
      const key = prefix + file.name;
      await put.run({ key, base64: await toBase64(file), contentType: file.type || undefined });
      setSelected(key);
    }
    if(fileInput.current) fileInput.current.value = "";
  }

  const list = (
    <Panel
      title={
        <Row gap={4} className="av-mono" style={{ fontWeight: 500 }}>
          <button type="button" className="av-button av-button-ghost av-button-sm" onClick={() => open("")}>
            /
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="av-row" style={{ gap: 4 }}>
              <button
                type="button"
                className="av-button av-button-ghost av-button-sm"
                onClick={() => open(`${crumbs.slice(0, i + 1).join("/")}/`)}
              >
                {c}
              </button>
              <span className="av-muted">/</span>
            </span>
          ))}
        </Row>
      }
      actions={
        <>
          <input ref={fileInput} type="file" multiple hidden onChange={e => upload(e.target.files)} />
          <Button size="sm" variant="primary" loading={put.pending} onClick={() => fileInput.current?.click()}>
            Upload
          </Button>
        </>
      }
      flush
    >
      <ErrorBanner error={put.error} />
      <DataTable<Entry>
        rows={page.data ? entries : undefined}
        loading={page.loading}
        error={page.error}
        empty={prefix ? "This folder is empty" : "This bucket is empty"}
        rowKey={e => e.key}
        selectedKey={selected}
        onRowClick={e => (e.kind === "folder" ? open(e.key) : setSelected(e.key))}
        maxHeight={560}
        hasMore={!!cursor}
        onLoadMore={async () => {
          const next = await api.list.call({ prefix, cursor });
          setExtra(x => ({ objects: [...x.objects, ...next.objects], cursor: next.cursor }));
        }}
        columns={[
          {
            key: "name",
            header: "Name",
            render: e => (
              <span className="av-mono">
                {e.kind === "folder" ? "📁 " : ""}
                {e.key.slice(prefix.length)}
              </span>
            )
          },
          { key: "size", header: "Size", align: "right", render: e => (e.kind === "object" ? formatBytes(e.size) : "") },
          { key: "type", header: "Type", render: e => (e.kind === "object" ? (e.contentType ?? "—") : "") },
          { key: "uploaded", header: "Uploaded", render: e => (e.kind === "object" ? formatTime(e.uploaded) : "") }
        ]}
      />
    </Panel>
  );

  if(!selected) return list;
  return (
    <Split
      leftWidth={560}
      left={list}
      right={<ObjectDetail key={selected} objectKey={selected} api={api} onClose={() => setSelected(undefined)} />}
    />
  );
});

function ObjectDetail({ objectKey, api, onClose }: { objectKey: string, api: R2Api, onClose: () => void }) {
  const head = api.head.useQuery({ key: objectKey });
  const del = api.delete.useMutation();
  const [text, setText] = useState<string>();

  const o = head.data;
  const isImage = o?.contentType?.startsWith("image/");
  const isText = !!o && o.size <= PREVIEW_LIMIT && /^(text\/|application\/(json|xml|javascript)|.*\+json)/.test(o.contentType ?? "text/plain");

  useEffect(() => {
    if(!isText) return;
    let cancelled = false;
    fetch(api.object.url({ key: objectKey }))
      .then(r => r.text())
      .then(t => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [isText, objectKey, o?.etag]);

  if(head.error) return <ErrorBanner error={head.error} />;
  if(head.loading && !o) return <Loading />;
  if(!o) {
    return (
      <Panel>
        <EmptyState title="Object not found" />
      </Panel>
    );
  }

  return (
    <Panel
      title={<span className="av-mono av-truncate">{o.key.split("/").pop()}</span>}
      actions={
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      }
    >
      <Stack gap={14}>
        <KeyValueList
          items={[
            ["Key", <span className="av-mono">{o.key}</span>],
            ["Size", formatBytes(o.size)],
            ["Type", o.contentType],
            ["Uploaded", formatTime(o.uploaded)],
            ["ETag", <span className="av-mono">{o.etag}</span>]
          ]}
        />
        {o.customMetadata && <JsonInspector value={o.customMetadata} />}
        {isImage && (
          <img
            src={api.object.url({ key: objectKey })}
            alt={o.key}
            style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid var(--av-border)" }}
          />
        )}
        {isText && (text === undefined ? <Loading /> : <Code>{text || <span className="av-null">empty</span>}</Code>)}
        {!isImage && !isText && <span className="av-muted">No preview for this type.</span>}
        <ErrorBanner error={del.error} />
        <Row gap={8} justify="flex-end">
          <LinkButton href={api.object.url({ key: objectKey, download: true })} external={false}>
            Download
          </LinkButton>
          <ActionButton
            variant="danger"
            confirm="Click to delete"
            onAction={async () => {
              await del.run({ key: objectKey });
              onClose();
            }}
          >
            Delete
          </ActionButton>
        </Row>
      </Stack>
    </Panel>
  );
}
