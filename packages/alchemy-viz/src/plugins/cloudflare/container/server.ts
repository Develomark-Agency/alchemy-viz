import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";

/**
 * Local containers, through the Docker CLI.
 *
 * In `alchemy dev`, workerd starts one Docker container per Durable Object
 * instance of a container-backed class. Alchemy labels each with
 * `alchemy.runtime` and tags the class's image `alchemy-dev/<class>:<hash>`,
 * which is how a Container resource finds its own.
 */

const RUNTIME_LABEL = "alchemy.runtime";
const IMAGE_PREFIX = "alchemy-dev/";

export interface ContainerInfo {
  id: string,
  name: string,
  /** The Durable Object instance that owns the container, from its name. */
  objectId?: string,
  image: string,
  state: string,
  status: string,
  created: string,
  ports: string
}

async function docker(args: string[], options: { timeoutMs?: number } = {}) {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
  } catch {
    throw new Error("The docker CLI isn't installed or isn't on PATH. Local containers run in Docker.");
  }
  const timer = setTimeout(() => proc.kill(), options.timeoutMs ?? 15_000);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited
  ]);
  clearTimeout(timer);
  if(code !== 0) {
    if(/Cannot connect to the Docker daemon|daemon is not running|error during connect/i.test(stderr)) {
      throw new Error("Docker isn't running. Start Docker, then `alchemy dev` can run this Container.");
    }
    throw new Error(stderr.trim() || `docker ${args[0]} exited with ${code}`);
  }
  return { stdout, stderr };
}

/**
 * Lowercased Durable Object class names whose image tags belong to this
 * resource. A container-backed class is named after its Container; a
 * Durable Object that starts Containers itself has an application resource
 * naming its class, with a binding per Container it runs.
 */
function classNames(ctx: HandlerContext) {
  const r = requireResource(ctx);
  const names: unknown[] = [r.attr?.className, r.logicalId];
  for(const app of ctx.stack.resources.filter(x => x.type === "Cloudflare.Containers.DurableObjectApplication")) {
    const runsThis = app.bindings.some(b => b.sid === r.logicalId || (b.data as { container?: { id?: string } })?.container?.id === r.logicalId);
    if(app.fqn === r.fqn || runsThis) names.push(app.attr?.className ?? app.props?.className);
  }
  return [...new Set(names.filter((n): n is string => typeof n === "string" && n !== "").map(n => n.toLowerCase()))];
}

async function listAll(): Promise<ContainerInfo[]> {
  const { stdout } = await docker(["ps", "--all", "--no-trunc", "--filter", `label=${RUNTIME_LABEL}`, "--format", "{{json .}}"]);
  return stdout
    .split("\n")
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as Record<string, string>)
    .map(c => ({
      id: c.ID ?? "",
      name: c.Names ?? "",
      // workerd names a container `workerd-<namespace>-<object id>`.
      objectId: /-([0-9a-f]{64})$/.exec(c.Names ?? "")?.[1],
      image: c.Image ?? "",
      state: c.State ?? "",
      status: c.Status ?? "",
      created: c.CreatedAt ?? "",
      ports: c.Ports ?? ""
    }));
}

function belongs(classes: string[], c: ContainerInfo) {
  return classes.some(n => c.image.startsWith(`${IMAGE_PREFIX}${n}:`));
}

export interface LogLine {
  time: number,
  message: string,
  stream: string
}

async function readLogs(id: string, tail: number): Promise<LogLine[]> {
  const { stdout, stderr } = await docker(["logs", "--timestamps", "--tail", String(tail), id]);
  // `docker logs` replays the container's stdout and stderr on its own two streams.
  return [
    ...stdout.split("\n").map(line => ({ line, stream: "stdout" })),
    ...stderr.split("\n").map(line => ({ line, stream: "stderr" }))
  ]
    .filter(l => l.line.trim())
    .map(({ line, stream }) => {
      const space = line.indexOf(" ");
      const time = Date.parse(line.slice(0, space));
      return Number.isNaN(time) ? { time: 0, message: line, stream } : { time, message: line.slice(space + 1), stream };
    })
    .sort((x, y) => x.time - y.time);
}

async function readInspect(c: ContainerInfo) {
  const { stdout } = await docker(["inspect", c.id]);
  const [info] = JSON.parse(stdout) as Array<Record<string, any>>;
  return {
    id: c.id,
    name: String(info?.Name ?? c.name).replace(/^\//, ""),
    image: c.image,
    startedAt: info?.State?.StartedAt as string | undefined,
    exitCode: info?.State?.ExitCode as number | undefined,
    // Environment values can hold secrets: names only.
    env: ((info?.Config?.Env ?? []) as string[]).map(e => e.split("=")[0]!).sort(),
    cmd: [...(info?.Config?.Entrypoint ?? []), ...(info?.Config?.Cmd ?? [])] as string[],
    ports: c.ports,
    memory: info?.HostConfig?.Memory as number | undefined,
    cpus: info?.HostConfig?.NanoCpus ? info.HostConfig.NanoCpus / 1e9 : undefined
  };
}

/**
 * Containers seen recently. workerd removes a container seconds after its
 * Durable Object goes idle, so without this an instance and its output
 * would vanish before anyone could look at them.
 */
const RETAIN_MS = 15 * 60_000;
const seen = new Map<string, { info: ContainerInfo, lastSeen: number, logs?: LogLine[], inspect?: Awaited<ReturnType<typeof readInspect>> }>();

async function mine(ctx: HandlerContext) {
  const classes = classNames(ctx);
  const all = await listAll();
  const live = all.filter(c => belongs(classes, c));
  const now = Date.now();
  await Promise.all(live.map(async c => {
    const entry = seen.get(c.id) ?? { info: c, lastSeen: now };
    entry.info = c;
    entry.lastSeen = now;
    seen.set(c.id, entry);
    // Capture output while it can still be read.
    if(c.state === "running") entry.logs = await readLogs(c.id, 300).catch(() => entry.logs);
    entry.inspect ??= await readInspect(c).catch(() => undefined);
  }));
  for(const [id, entry] of seen) {
    if(now - entry.lastSeen > RETAIN_MS) seen.delete(id);
  }
  const liveIds = new Set(live.map(c => c.id));
  const removed = [...seen.values()]
    .filter(e => !liveIds.has(e.info.id) && belongs(classes, e.info))
    .map(e => ({ ...e.info, state: "removed", status: `Removed ${Math.max(1, Math.round((now - e.lastSeen) / 60_000))} min ago` }));
  return { containers: [...live, ...removed], others: all.length - live.length };
}

function find(ctx: HandlerContext, id: string) {
  const entry = [...seen.values()].find(e => e.info.id === id);
  if(!entry || !belongs(classNames(ctx), entry.info)) throw new Error("That container isn't one of this Container's instances.");
  return entry;
}

const idInput = z.object({ id: z.string().regex(/^[0-9a-f]{12,64}$/, "Not a container id") });

export default defineServer({
  containers: async (_: undefined, ctx) => ({ ...(await mine(ctx)), classes: classNames(ctx) }),

  /** The container's output. A removed container's last captured output. */
  logs: handler(idInput.extend({ tail: z.number().int().min(10).max(2000).default(300) }), async (input, ctx) => {
    const entry = find(ctx, input.id);
    if(entry.info.state === "running") entry.logs = await readLogs(entry.info.id, input.tail).catch(() => entry.logs);
    return entry.logs ?? [];
  }),

  inspect: handler(idInput, async (input, ctx) => {
    const entry = find(ctx, input.id);
    entry.inspect ??= await readInspect(entry.info);
    return entry.inspect;
  }),

  /** Stops one instance. Its Durable Object starts a fresh container the next time it needs one. */
  stop: handler(idInput, async (input, ctx) => {
    const c = find(ctx, input.id).info;
    await docker(["stop", "--time", "5", c.id], { timeoutMs: 30_000 });
    return { id: c.id };
  })
});
