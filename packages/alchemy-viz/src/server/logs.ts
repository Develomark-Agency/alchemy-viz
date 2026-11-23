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
const cache = new Map<string, { size: number, lines: LogLine[] }>();

export async function readLogs(
  root: string,
  options: { fqn?: string, since?: number, limit?: number } = {}): Promise<LogLine[]> {
  const dir = join(root, ".alchemy", "log");
  let files: string[];
  try {
    files = (await readdir(dir)).filter(f => f.endsWith(".ndjson")).sort().slice(-MAX_FILES);
  } catch {
    return [];
  }
  const all: LogLine[] = [];
  for(const file of files) {
    const path = join(dir, file);
    const { size } = await stat(path);
    let cached = cache.get(path);
    if(!cached || cached.size !== size) {
      const lines: LogLine[] = [];
      for(const raw of (await readFile(path, "utf8")).split("\n")) {
        if(!raw) continue;
        try {
          const entry = JSON.parse(raw);
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
      cached = { size, lines };
      cache.set(path, cached);
    }
    all.push(...cached.lines);
  }
  let result = all;
  if(options.fqn) result = result.filter(l => l.fqn === options.fqn);
  if(options.since) result = result.filter(l => l.time > options.since!);
  result.sort((a, b) => a.time - b.time);
  return result.slice(-(options.limit ?? 500));
}
