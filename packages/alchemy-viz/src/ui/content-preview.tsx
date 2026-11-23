import Papa from "papaparse";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, type CodeLanguage, languageFor } from "./code-block.tsx";
import { DataTable, inferColumns } from "./data-table.tsx";
import { Banner } from "./feedback.tsx";
import { SegmentedControl } from "./form.tsx";
import { JsonInspector } from "./json-inspector.tsx";

export type PreviewKind = "csv" | "tsv" | "markdown" | "html" | "json" | "ndjson" | "svg";

/** Which rendered view a file gets, from its content type or name. */
export function previewKind(contentType: string | undefined, name = ""): PreviewKind | undefined {
  const type = contentType ?? "";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if(/csv/.test(type) || ext === "csv") return "csv";
  if(/tab-separated/.test(type) || ext === "tsv") return "tsv";
  if(/markdown/.test(type) || ext === "md" || ext === "markdown") return "markdown";
  if(/ndjson|jsonl/.test(type) || ext === "ndjson" || ext === "jsonl") return "ndjson";
  if(/json/.test(type) || ext === "json") return "json";
  if(/svg/.test(type) || ext === "svg") return "svg";
  if(/html/.test(type) || ext === "html" || ext === "htm") return "html";
  return undefined;
}

const MAX_ROWS = 5_000;

function Delimited({ text, delimiter }: { text: string, delimiter: string }) {
  const parsed = useMemo(() => Papa.parse<Record<string, unknown>>(text.trim(), { header: true, delimiter, dynamicTyping: true, skipEmptyLines: true }), [text, delimiter]);
  const rows = parsed.data.slice(0, MAX_ROWS);
  const columns = useMemo(() => inferColumns(rows), [rows]);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <DataTable rows={rows} columns={columns} getRowId={(_, i) => String(i)} maxHeight={480} footer={`${parsed.data.length.toLocaleString()} rows${parsed.data.length > MAX_ROWS ? `, first ${MAX_ROWS.toLocaleString()} shown` : ""}`} />
    </div>
  );
}

function Ndjson({ text }: { text: string }) {
  const rows = useMemo(() => text.split("\n").filter(Boolean).slice(0, MAX_ROWS).map(line => {
    try {
      const value = JSON.parse(line);
      return value && typeof value === "object" && !Array.isArray(value) ? value : { value };
    } catch {
      return { invalid: line };
    }
  }), [text]);
  const columns = useMemo(() => inferColumns(rows), [rows]);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <DataTable rows={rows} columns={columns} getRowId={(_, i) => String(i)} maxHeight={480} footer={`${rows.length.toLocaleString()} lines`} />
    </div>
  );
}

function Json({ text }: { text: string }) {
  const value = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(text) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  }, [text]);
  if(!value.ok) return <Banner tone="warn">Not valid JSON: {value.error}</Banner>;
  return (
    <div className="max-h-[480px] overflow-auto rounded-md border border-line p-3">
      <JsonInspector value={value.value} label="Value" />
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="av-prose max-h-[560px] overflow-auto rounded-md border border-line px-5 py-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/** Rendered with scripts off: the sandbox has no allow-scripts. */
function Html({ text }: { text: string }) {
  return <iframe title="Rendered HTML" sandbox="" srcDoc={text} className="h-[480px] w-full rounded-md border border-line bg-white" />;
}

/**
 * Shows a text file either rendered (CSV and NDJSON as tables, Markdown
 * and HTML rendered, JSON as a tree, SVG as an image) or as raw source,
 * with a toggle between the two.
 */
export function ContentPreview({ text, kind, src, raw: rawLanguage }: { text: string, kind: PreviewKind, src?: string, raw?: CodeLanguage }) {
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const language: CodeLanguage = rawLanguage ?? (kind === "svg" ? "xml" : kind === "ndjson" ? "json" : kind === "csv" || kind === "tsv" ? "text" : languageFor(kind === "markdown" ? "text/markdown" : `text/${kind}`));

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        aria-label="Preview mode"
        className="h-7 self-start"
        value={mode}
        onValueChange={setMode}
        options={[{ value: "rendered", label: kind === "csv" || kind === "tsv" || kind === "ndjson" ? "Table" : "Rendered" }, { value: "raw", label: "Raw" }]}
      />
      {mode === "raw"
        ? <CodeBlock code={text || "(empty)"} language={language} />
        : kind === "csv" ? <Delimited text={text} delimiter="," />
          : kind === "tsv" ? <Delimited text={text} delimiter={"\t"} />
            : kind === "ndjson" ? <Ndjson text={text} />
              : kind === "json" ? <Json text={text} />
                : kind === "markdown" ? <Markdown text={text} />
                  : kind === "html" ? <Html text={text} />
                    : <img src={src} alt="" className="max-h-96 max-w-full rounded-md border border-line object-contain" />}
    </div>
  );
}
