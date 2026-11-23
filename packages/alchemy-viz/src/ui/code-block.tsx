import { useEffect, useState } from "react";
import type { BundledLanguage, HighlighterGeneric } from "shiki";
import { cn } from "./cn.ts";

const LANGS = ["json", "sql", "html", "xml", "css", "javascript", "typescript", "yaml", "markdown", "shellscript"] as const;
export type CodeLanguage = (typeof LANGS)[number] | "text";

let highlighter: Promise<HighlighterGeneric<BundledLanguage, "github-light" | "github-dark">> | undefined;

function getHighlighter() {
  highlighter ??= import("shiki").then(({ createHighlighter }) => createHighlighter({ themes: ["github-light", "github-dark"], langs: [...LANGS] }));
  return highlighter;
}

/** Picks a highlighting language from a content type, e.g. `application/json`. */
export function languageFor(contentType: string | undefined): CodeLanguage {
  const type = contentType ?? "";
  if(/json/.test(type)) return "json";
  if(/html/.test(type)) return "html";
  if(/xml|svg/.test(type)) return "xml";
  if(/css/.test(type)) return "css";
  if(/javascript|ecmascript/.test(type)) return "javascript";
  if(/yaml/.test(type)) return "yaml";
  if(/markdown/.test(type)) return "markdown";
  if(/sql/.test(type)) return "sql";
  return "text";
}

/** Read-only, syntax-highlighted code. Pretty-prints JSON. */
export function CodeBlock({ code, language = "text", className, maxHeight = 480 }: { code: string, language?: CodeLanguage, className?: string, maxHeight?: number }) {
  const text = language === "json" ? pretty(code) : code;
  const [html, setHtml] = useState<string>();

  useEffect(() => {
    if(language === "text" || text.length > 200_000) return setHtml(undefined);
    let cancelled = false;
    getHighlighter().then(h => {
      if(!cancelled) setHtml(h.codeToHtml(text, { lang: language, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false }));
    });
    return () => {
      cancelled = true;
    };
  }, [text, language]);

  const box = cn("overflow-auto rounded-md border border-line bg-surface-2/60 p-3 font-mono text-xs leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-words", className);
  if(html) return <div className={box} style={{ maxHeight }} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <pre className={cn(box, "whitespace-pre-wrap break-words")} style={{ maxHeight }}>
      {text}
    </pre>
  );
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
