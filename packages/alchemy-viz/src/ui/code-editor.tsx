import { json } from "@codemirror/lang-json";
import { type SQLNamespace, sql, SQLite } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";
import { cn } from "cn";

// Colors come from the --av-* tokens, so the editor follows the page's
// light or dark scheme without swapping themes.
const theme = EditorView.theme({
  "&": { backgroundColor: "var(--av-surface)", color: "var(--av-fg)", fontSize: "12.5px" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--av-fg)", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "var(--av-surface)", color: "var(--av-fg-subtle)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--av-hover) 60%, transparent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in oklab, var(--av-accent) 25%, transparent) !important" },
  ".cm-cursor": { borderLeftColor: "var(--av-fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip": { backgroundColor: "var(--av-surface)", border: "1px solid var(--av-line)", borderRadius: "8px", boxShadow: "var(--shadow-popup)", overflow: "hidden" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--av-hover)", color: "var(--av-fg)" },
  ".cm-placeholder": { color: "var(--av-fg-subtle)" }
});

const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--av-accent)" },
  { tag: [t.string, t.special(t.string)], color: "var(--av-ok)" },
  { tag: [t.number, t.bool, t.null], color: "var(--av-info)" },
  { tag: [t.propertyName, t.typeName], color: "var(--av-warn)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--av-fg-subtle)", fontStyle: "italic" },
  { tag: [t.punctuation, t.bracket, t.operator], color: "var(--av-fg-muted)" }
]));

export type EditorLanguage = "sql" | "json" | "text";

/**
 * A code editor for SQL, JSON or plain text. Cmd/Ctrl+Enter calls
 * `onSubmit`. For SQL, `schema` ({ table: [columns] }) powers autocomplete.
 */
export function CodeEditor({
  value,
  onChange,
  onSubmit,
  language = "text",
  schema,
  placeholder,
  readOnly,
  minHeight = 120,
  maxHeight = 420,
  className,
  "aria-label": ariaLabel
}: {
  value: string,
  onChange?: (value: string) => void,
  onSubmit?: () => void,
  language?: EditorLanguage,
  schema?: SQLNamespace,
  placeholder?: string,
  readOnly?: boolean,
  minHeight?: number,
  maxHeight?: number,
  className?: string,
  "aria-label"?: string
}) {
  // Read the latest onSubmit from a ref so the keymap extension stays stable.
  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  const extensions = useMemo(() => {
    const list: Extension[] = [
      theme,
      highlight,
      EditorView.lineWrapping,
      // The default keymap binds Mod-Enter to "insert blank line"; this must win.
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => (submit.current ? (submit.current(), true) : false) }]))
    ];
    if(ariaLabel) list.push(EditorView.contentAttributes.of({ "aria-label": ariaLabel }));
    if(language === "sql") list.push(sql({ dialect: SQLite, schema, upperCaseKeywords: true }));
    if(language === "json") list.push(json());
    return list;
  }, [language, schema, ariaLabel]);

  return (
    <div className={cn("overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20", className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        placeholder={placeholder}
        readOnly={readOnly}
        editable={!readOnly}
        minHeight={`${minHeight}px`}
        maxHeight={`${maxHeight}px`}
        basicSetup={{ foldGutter: false, highlightActiveLineGutter: false, lineNumbers: language !== "text", searchKeymap: false }}
      />
    </div>
  );
}
