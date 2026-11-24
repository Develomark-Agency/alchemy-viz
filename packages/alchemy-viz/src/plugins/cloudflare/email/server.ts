import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import { type LogLine, readLogs } from "../../../server/logs.ts";
import { localRoot } from "../do-storage.ts";

/**
 * Mail a Worker sent through a `send_email` binding under `alchemy dev`.
 *
 * The local simulator doesn't deliver mail: it stores each message under
 * `.alchemy/local/email` (a raw `.eml`, or a builder message's text, HTML
 * and attachments as separate files) and logs what it stored. The log is
 * the only place that ties a message to its Worker and, for builder
 * messages, holds the headers, so the outbox is rebuilt from it.
 */

const START = "send_email binding called with ";

export interface SentEmail {
  /** Position in the log, stable for one run of `alchemy dev`. */
  id: string,
  time: number,
  from?: string,
  to?: string,
  cc?: string,
  subject?: string,
  /** Where the simulator stored the message's parts. */
  files: { eml?: string, text?: string, html?: string, attachments: Array<{ name: string, disposition: string, path: string }> }
}

export interface EmailBody {
  headers: Array<[string, string]>,
  text?: string,
  html?: string,
  raw?: string,
  attachments: Array<{ name: string, disposition: string, path: string, size?: number }>,
  missing: boolean
}

const HEADER = /^(From|To|Cc|Bcc|Subject): (.*)$/;
const PART = /^(Text|HTML): (.+)$/;
const ATTACHMENT = /^Attachment \(([^)]*)\): (.*) -> (.+)$/;

/** Groups each "send_email binding called" line with the lines that follow it. */
export function parse(lines: LogLine[]): SentEmail[] {
  const out: SentEmail[] = [];
  for(let i = 0; i < lines.length; i++) {
    const start = lines[i]!;
    if(!start.message.startsWith(START)) continue;
    const email: SentEmail = { id: `${start.time}-${i}`, time: start.time, files: { attachments: [] } };
    // The simulator logs one multi-line message; the log stores its lines separately.
    const inline = start.message.split("\n").slice(1);
    const rest = inline.length ? inline : [];
    let j = i + 1;
    if(!inline.length) {
      while(j < lines.length && lines[j]!.fqn === start.fqn && lines[j]!.time - start.time < 250 && !lines[j]!.message.startsWith(START)) {
        rest.push(lines[j]!.message);
        j++;
      }
    }
    for(const raw of rest) {
      const line = raw.trim();
      let m: RegExpExecArray | null;
      if((m = HEADER.exec(line))) {
        const key = m[1]!.toLowerCase() as "from" | "to" | "cc" | "subject" | "bcc";
        if(key !== "bcc") email[key] = m[2];
      } else if((m = PART.exec(line))) {
        email.files[m[1] === "Text" ? "text" : "html"] = m[2]!;
      } else if((m = ATTACHMENT.exec(line))) {
        email.files.attachments.push({ disposition: m[1]!, name: m[2]!, path: m[3]! });
      } else if(line.endsWith(".eml")) {
        email.files.eml = line;
      }
    }
    out.push(email);
    i = Math.max(i, j - 1);
  }
  return out;
}

/** Reads a file the simulator stored, refusing anything outside its directory. */
function readStored(ctx: HandlerContext, path: string | undefined, encoding: "utf8" | "latin1" = "utf8") {
  if(!path) return undefined;
  const root = resolve(localRoot(ctx.root), "email");
  const file = resolve(path);
  if(!file.startsWith(root + sep)) return undefined;
  return existsSync(file) ? readFileSync(file, encoding) : undefined;
}

function decodeQuotedPrintable(s: string) {
  const bytes = s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

function decodeBody(body: string, encoding: string | undefined) {
  const e = encoding?.toLowerCase();
  if(e === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if(e === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

/** Headers and body of a MIME entity, with folded header lines joined. */
function splitEntity(source: string) {
  const at = source.search(/\r?\n\r?\n/);
  const head = at === -1 ? source : source.slice(0, at);
  const body = at === -1 ? "" : source.slice(at).replace(/^\r?\n\r?\n/, "");
  const headers: Array<[string, string]> = [];
  for(const line of head.split(/\r?\n/)) {
    if(/^[ \t]/.test(line) && headers.length) headers.at(-1)![1] += ` ${line.trim()}`;
    else {
      const colon = line.indexOf(":");
      if(colon > 0) headers.push([line.slice(0, colon), line.slice(colon + 1).trim()]);
    }
  }
  return { headers, body };
}

function header(headers: Array<[string, string]>, name: string) {
  return headers.find(([k]) => k.toLowerCase() === name)?.[1];
}

/** Text and HTML bodies of a MIME message, walking multipart containers. */
export function bodies(source: string, depth = 0): { text?: string, html?: string } {
  const { headers, body } = splitEntity(source);
  const type = header(headers, "content-type") ?? "text/plain";
  const encoding = header(headers, "content-transfer-encoding");
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if(/^multipart\//i.test(type) && boundary && depth < 5) {
    const out: { text?: string, html?: string } = {};
    for(const part of body.split(`--${boundary}`).slice(1)) {
      if(part.startsWith("--")) break;
      const inner = bodies(part.replace(/^\r?\n/, ""), depth + 1);
      out.text ??= inner.text;
      out.html ??= inner.html;
    }
    return out;
  }
  if(/^text\/html/i.test(type)) return { html: decodeBody(body, encoding) };
  if(/^text\//i.test(type)) return { text: decodeBody(body, encoding) };
  return {};
}

async function outbox(ctx: HandlerContext) {
  const worker = requireResource(ctx);
  const emails = parse(await readLogs(ctx.root, { fqn: worker.fqn, limit: 5000 })).reverse();
  // A raw message's headers are in its .eml, not the log.
  for(const e of emails) {
    if(!e.files.eml) continue;
    const raw = readStored(ctx, e.files.eml);
    if(!raw) continue;
    const { headers } = splitEntity(raw);
    e.from ??= header(headers, "from");
    e.to ??= header(headers, "to");
    e.cc ??= header(headers, "cc");
    e.subject ??= header(headers, "subject");
  }
  return emails;
}

export default defineServer({
  list: async (_: undefined, ctx) => outbox(ctx),

  message: handler(z.object({ id: z.string().min(1) }), async (input, ctx): Promise<EmailBody | null> => {
    const email = (await outbox(ctx)).find(e => e.id === input.id);
    if(!email) return null;
    const attachments = email.files.attachments.map(a => ({ ...a, size: readStored(ctx, a.path, "latin1")?.length }));
    if(email.files.eml) {
      const raw = readStored(ctx, email.files.eml);
      if(raw === undefined) return { headers: [], attachments, missing: true };
      return { headers: splitEntity(raw).headers, ...bodies(raw), raw, attachments, missing: false };
    }
    const text = readStored(ctx, email.files.text);
    const html = readStored(ctx, email.files.html);
    const headers: Array<[string, string]> = [["From", email.from ?? ""], ["To", email.to ?? ""], ...(email.cc ? [["Cc", email.cc] as [string, string]] : []), ["Subject", email.subject ?? ""]];
    return { headers, text, html, attachments, missing: (email.files.text !== undefined && text === undefined) || (email.files.html !== undefined && html === undefined) };
  })
});
