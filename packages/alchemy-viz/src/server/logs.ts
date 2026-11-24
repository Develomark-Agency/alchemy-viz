/**
 * Reads Alchemy's run logs from `.alchemy/log/*.ndjson`.
 *
 * Every `alchemy dev` run writes one file. Lines from a resource (a
 * Worker's `console.log`, provider messages) carry `attributes.fqn`, which
 * gives every local resource a log tab without provider-specific code.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface LogLine {
  time: number,
  level: string,
  kind: string,
  process: string,
  fqn: string | undefined,
  message: string,
  stream?: string
}

const MAX_FILES = 5;

export interface ResourceStatusEvent {
  time: number,
  status: string,
  message?: string
}

function statusEventOf(entry: any): (ResourceStatusEvent & { fqn: string }) | undefined {
  const d = entry.data;
  if(entry.kind !== "event" || d?.type !== "apply.resource.status" || !d.fqn || typeof d.status !== "string") return undefined;
  return { fqn: d.fqn, time: entry.time, status: d.status, message: typeof d.message === "string" ? d.message : undefined };
}

function messageOf(entry: any): string | undefined {
  if(entry.kind === "output") return entry.data?.text;
  if(entry.kind === "log") {
    const m = entry.data?.message ?? entry.message ?? entry.data;
    if(typeof m === "string") return m;
    if(Array.isArray(m)) return m.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    return m === undefined ? undefined : JSON.stringify(m);
  }
  return undefined;
}

// Parsed-file cache keyed by path; a file is re-read only when it grows.
const cache = new Map<string, { size: number, lines: LogLine[], events: Array<ResourceStatusEvent & { fqn: string }> }>();

async function readFiles(root: string) {
  const dir = join(root, ".alchemy", "log");
  let files: string[];
  try {
    files = (await readdir(dir)).filter(f => f.endsWith(".ndjson")).sort().slice(-MAX_FILES);
  } catch {
    return [];
  }
  const parsed: Array<{ lines: LogLine[], events: Array<ResourceStatusEvent & { fqn: string }> }> = [];
  for(const file of files) {
    const path = join(dir, file);
    const { size } = await stat(path);
    let cached = cache.get(path);
    if(!cached || cached.size !== size) {
      const lines: LogLine[] = [];
      const events: Array<ResourceStatusEvent & { fqn: string }> = [];
      for(const raw of (await readFile(path, "utf8")).split("\n")) {
        if(!raw) continue;
        try {
          const entry = JSON.parse(raw);
          const event = statusEventOf(entry);
          if(event) {
            events.push(event);
            // A failed apply is worth showing in the resource's own log tab.
            if(event.status === "fail" && event.message) {
              lines.push({ time: entry.time, level: "error", kind: "event", process: entry.process, fqn: event.fqn, message: event.message });
            }
            continue;
          }
          const message = messageOf(entry);
          if(message === undefined) continue;
          lines.push({
            time: entry.time,
            level: entry.level ?? "info",
            kind: entry.kind,
            process: entry.process,
            fqn: entry.attributes?.fqn,
            message: message.replace(/\n$/, ""),
            stream: entry.data?.stream
          });
        } catch {
          // A line being written right now can be partial; skip it.
        }
      }
      cached = { size, lines, events };
      cache.set(path, cached);
    }
    parsed.push(cached);
  }
  return parsed;
}

/**
 * The latest apply status each resource reported across recent runs. State
 * keeps a resource at `creating` when its apply fails, so this is how a
 * failure becomes visible.
 */
export async function readLatestStatuses(root: string): Promise<Map<string, ResourceStatusEvent>> {
  const latest = new Map<string, ResourceStatusEvent>();
  for(const { events } of await readFiles(root)) {
    for(const { fqn, ...event } of events) {
      const prev = latest.get(fqn);
      if(!prev || event.time >= prev.time) latest.set(fqn, event);
    }
  }
  return latest;
}

export async function readLogs(
  root: string,
  options: { fqn?: string, since?: number, limit?: number } = {}): Promise<LogLine[]> {
  const all = (await readFiles(root)).flatMap(f => f.lines);
  let result = all;
  if(options.fqn) result = result.filter(l => l.fqn === options.fqn);
  if(options.since) result = result.filter(l => l.time > options.since!);
  result.sort((a, b) => a.time - b.time);
  return result.slice(-(options.limit ?? 500));
}
