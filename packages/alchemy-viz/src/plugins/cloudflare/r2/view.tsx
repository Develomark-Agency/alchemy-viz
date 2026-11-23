import { Download, File, Folder, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { type Api, defineView, useUrlState } from "../../../client/index.tsx";
import {
  Button,
  CodeBlock,
  ContentPreview,
  type Column,
  ConfirmButton,
  DataTable,
  EmptyState,
  ErrorBanner,
  formatBytes,
  formatTime,
  IconButton,
  JsonInspector,
  KeyValueList,
  languageFor,
  LinkButton,
  Loading,
  Panel,
  previewKind,
  Split,
  toast,
  useSplitSideBySide
} from "../../../ui/index.ts";
import { useQuery } from "@tanstack/react-query";
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
  const [prefix = "", setPrefix] = useUrlState("prefix");
  const [selected, setSelected] = useUrlState("object");
  const pages = api.list.useInfiniteQuery({ prefix }, { getNextCursor: p => p.cursor });
  const put = api.put.useMutation();
  const fileInput = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[] | undefined>(() => {
    if(!pages.data) return undefined;
    const folders = pages.data.pages[0]?.folders ?? [];
    return [
      ...folders.map((key): Entry => ({ kind: "folder", key })),
      ...pages.data.pages.flatMap(p => p.objects).map((o): Entry => ({ kind: "object", ...o }))
    ];
  }, [pages.data]);

  const columns = useMemo<Array<Column<Entry>>>(() => [
    {
      id: "name",
      header: "Name",
      size: 300,
      accessor: e => `${e.kind === "folder" ? 0 : 1}${e.key}`,
      cell: e => (
        <span className="inline-flex items-center gap-2 font-mono text-xs">
          {e.kind === "folder" ? <Folder className="size-3.5 text-accent" /> : <File className="size-3.5 text-fg-subtle" />}
          {e.key.slice(prefix.length)}
        </span>
      )
    },
    { id: "size", header: "Size", size: 90, align: "right", accessor: e => (e.kind === "object" ? e.size : -1), cell: e => (e.kind === "object" ? formatBytes(e.size) : "") },
    { id: "type", header: "Type", size: 140, accessor: e => (e.kind === "object" ? e.contentType : ""), cell: e => (e.kind === "object" ? <span className="text-fg-muted">{e.contentType ?? "—"}</span> : "") },
    { id: "uploaded", header: "Uploaded", size: 180, accessor: e => (e.kind === "object" ? e.uploaded : ""), cell: e => (e.kind === "object" ? <span className="text-fg-muted">{formatTime(e.uploaded)}</span> : "") }
  ], [prefix]);

  const crumbs = prefix.split("/").filter(Boolean);

  function open(next: string) {
    setPrefix(next || undefined);
    setSelected(undefined);
  }

  async function upload(files: FileList | null) {
    for(const file of Array.from(files ?? [])) {
      const key = prefix + file.name;
      try {
        await put.mutateAsync({ key, base64: await toBase64(file), contentType: file.type || undefined });
        toast("Uploaded", { description: key });
        setSelected(key);
      } catch {}
    }
    if(fileInput.current) fileInput.current.value = "";
  }

  const list = (
    <Panel
      title={(
        <nav aria-label="Folder" className="flex min-w-0 items-center gap-0.5 font-mono text-xs font-normal">
          <button type="button" onClick={() => open("")} className="rounded px-1.5 py-0.5 hover:bg-hover">
            bucket
          </button>
          {crumbs.map((c, i) => (
            <span key={`${i}-${c}`} className="flex items-center gap-0.5">
              <span className="text-fg-subtle">/</span>
              <button type="button" onClick={() => open(`${crumbs.slice(0, i + 1).join("/")}/`)} className="rounded px-1.5 py-0.5 hover:bg-hover">
                {c}
              </button>
            </span>
          ))}
        </nav>
      )}
      actions={(
        <>
          <input ref={fileInput} type="file" multiple hidden onChange={e => upload(e.target.files)} />
          <Button size="sm" variant="primary" onClick={() => fileInput.current?.click()}>
            <Upload />
            Upload
          </Button>
        </>
      )}
      flush
    >
      <ErrorBanner error={put.error} className="m-3" />
      <ObjectTable
        rows={entries}
        columns={columns}
        getRowId={e => e.key}
        loading={pages.isPending}
        error={pages.error}
        empty={prefix ? "This folder is empty" : "This bucket is empty"}
        selectedId={selected}
        onRowClick={e => (e.kind === "folder" ? open(e.key) : setSelected(e.key))}
        hasMore={pages.hasNextPage}
        loadingMore={pages.isFetchingNextPage}
        onEndReached={() => pages.fetchNextPage()}
        scroll="page"
      />
    </Panel>
  );

  if(!selected) return list;
  return <Split leftWidth={560} left={list} right={<ObjectDetail key={selected} objectKey={selected} api={api} onClose={() => setSelected(undefined)} />} />;
});

/**
 * Beside an open object the list is narrow, so it keeps only name and
 * size; type and date are in the detail panel. Stacked, it shows them all.
 */
function ObjectTable({ columns, ...rest }: Parameters<typeof DataTable<Entry>>[0]) {
  const sideBySide = useSplitSideBySide();
  return <DataTable<Entry> {...rest} columns={sideBySide ? columns.filter(c => c.id === "name" || c.id === "size") : columns} />;
}

function ObjectDetail({ objectKey, api, onClose }: { objectKey: string, api: R2Api, onClose: () => void }) {
  const head = api.head.useQuery({ key: objectKey });
  const del = api.delete.useMutation();
  const o = head.data;
  // Browsers can't draw HEIC or TIFF, so those fall through to "no preview".
  const isImage = /^image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)$/.test(o?.contentType ?? "");
  const isPdf = o?.contentType === "application/pdf";
  const media = o?.contentType?.match(/^(audio|video)\//)?.[1] as "audio" | "video" | undefined;
  const language = languageFor(o?.contentType);
  const kind = o && o.size <= PREVIEW_LIMIT ? previewKind(o.contentType, o.key) : undefined;
  const isText = !!o && o.size <= PREVIEW_LIMIT && (!!kind || o.contentType?.startsWith("text/") || language !== "text" || !o.contentType);

  const text = useQuery({
    queryKey: [...api.object.key({ key: objectKey }), o?.etag],
    queryFn: async () => (await fetch(api.object.url({ key: objectKey }))).text(),
    enabled: isText
  });

  if(head.error) return <ErrorBanner error={head.error} />;
  if(head.isPending) return <Panel><Loading /></Panel>;
  if(!o) return <Panel><EmptyState title="Object not found" /></Panel>;

  return (
    <Panel
      className="animate-in fade-in duration-150 ease-out"
      title={<span className="truncate font-mono text-xs">{o.key.split("/").pop()}</span>}
      actions={(
        <>
          <LinkButton href={api.object.url({ key: objectKey, download: true })} external={false} size="sm">
            <Download />
            Download
          </LinkButton>
          <ConfirmButton
            title="Delete this object?"
            description={o.key}
            onConfirm={async () => {
              await del.mutateAsync({ key: objectKey });
              toast("Deleted", { description: o.key });
              onClose();
            }}
            trigger={<IconButton label="Delete object"><Trash2 /></IconButton>}
          />
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <KeyValueList
          items={[
            ["Key", <span className="font-mono text-xs">{o.key}</span>],
            ["Size", formatBytes(o.size)],
            ["Type", o.contentType],
            ["Uploaded", formatTime(o.uploaded)],
            ["ETag", <span className="font-mono text-xs">{o.etag}</span>]
          ]}
        />
        {o.customMetadata && <JsonInspector value={o.customMetadata} label="Custom metadata" />}
        {isImage && kind !== "svg" && <img src={api.object.url({ key: objectKey })} alt={o.key} className="max-h-96 max-w-full rounded-md border border-line object-contain" />}
        {isText && (text.data === undefined
          ? <Loading />
          : kind
            ? <ContentPreview text={text.data} kind={kind} src={api.object.url({ key: objectKey })} />
            : <CodeBlock code={text.data || "(empty)"} language={language} />)}
        {isPdf && <iframe title={o.key} src={api.object.url({ key: objectKey })} className="h-[560px] w-full rounded-md border border-line bg-white" />}
        {media === "audio" && <audio controls src={api.object.url({ key: objectKey })} className="w-full" />}
        {media === "video" && <video controls src={api.object.url({ key: objectKey })} className="max-h-96 w-full rounded-md border border-line bg-black" />}
        {!isImage && !isText && !isPdf && !media && <p className="text-[13px] text-fg-muted">No preview for this type. Download it to open it.</p>}
      </div>
    </Panel>
  );
}
