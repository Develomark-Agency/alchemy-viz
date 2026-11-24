import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import { listObjects, localRoot, readKvValue, toJsonSafe, withObject } from "../do-storage.ts";
import { localBinding } from "../runtime.ts";

/**
 * Workflow instances as the local engine stores them. Every instance is an
 * engine Durable Object: `INSTANCE_METADATA` holds its id and params,
 * `ENGINE_STATUS` its status, and the `states` table an event log of every
 * step, attempt and sleep, which becomes the timeline.
 */

// cloudflare-runtime/internal/workflows-shared/instance.ts
const STATUS = ["queued", "running", "paused", "errored", "terminated", "complete", "waitingForPause", "waiting"] as const;
export type InstanceStatus = (typeof STATUS)[number] | "unknown";

const E = {
  QUEUED: 0,
  START: 1,
  SUCCESS: 2,
  FAILURE: 3,
  TERMINATED: 4,
  STEP_START: 5,
  STEP_SUCCESS: 6,
  STEP_FAILURE: 7,
  SLEEP_START: 8,
  SLEEP_COMPLETE: 9,
  ATTEMPT_START: 10,
  ATTEMPT_SUCCESS: 11,
  ATTEMPT_FAILURE: 12,
  WAIT_START: 14,
  WAIT_COMPLETE: 15,
  WAIT_TIMED_OUT: 16
} as const;

export interface InstanceSummary {
  id: string,
  status: InstanceStatus,
  created: string,
  started?: string,
  ended?: string,
  /** Completed steps out of those started. */
  steps: { done: number, total: number }
}

export interface Step {
  name: string,
  type: "do" | "sleep" | "waitForEvent",
  status: "running" | "complete" | "errored" | "waiting",
  start: string,
  end?: string,
  attempts: Array<{ start: string, end?: string, error?: string }>,
  /** What the step returned, or for a sleep, how long it was. */
  result?: unknown,
  error?: string,
  config?: unknown,
  detail?: string
}

export interface InstanceDetail extends InstanceSummary {
  params: unknown,
  output: unknown,
  error?: string,
  timeline: Step[]
}

interface StateRow {
  event: number,
  target: string | null,
  groupKey: string | null,
  timestamp: string,
  metadata: string
}

interface Metadata {
  instance: { id: string, created_on: string },
  event: { payload?: unknown, timestamp?: unknown }
}

function iso(sqliteTime: string) {
  // `states.timestamp` is UTC without a zone: "2026-11-24 14:13:31.449".
  return new Date(`${sqliteTime.replace(" ", "T")}Z`).toISOString();
}

function parse(json: string): Record<string, any> {
  try {
    return JSON.parse(json) ?? {};
  } catch {
    return {};
  }
}

function errorText(meta: Record<string, any>) {
  const e = meta.error;
  if(!e) return undefined;
  if(typeof e === "string") return e;
  return [e.name, e.message].filter(Boolean).join(": ") || JSON.stringify(e);
}

/** Step names in the log carry a count suffix ("send email-1") so repeated names stay distinct. */
function stepName(target: string | null) {
  return (target ?? "step").replace(/-\d+$/, "");
}

/** JSON-safe, but absent stays absent rather than becoming an "undefined" marker. */
function safe(value: unknown) {
  return value === undefined ? undefined : toJsonSafe(value);
}

function readStates(db: Database): StateRow[] {
  const exists = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'states'").get();
  return exists ? (db.query("SELECT event, target, groupKey, timestamp, metadata FROM states ORDER BY id").all() as StateRow[]) : [];
}

function timeline(states: StateRow[]): Step[] {
  const steps = new Map<string, Step>();
  for(const s of states) {
    const key = s.groupKey ?? s.target ?? "";
    const meta = parse(s.metadata);
    const at = iso(s.timestamp);
    const step = steps.get(key);
    switch(s.event) {
      case E.STEP_START:
        steps.set(key, { name: stepName(s.target), type: "do", status: "running", start: at, attempts: [], config: meta.config });
        break;
      case E.ATTEMPT_START:
        step?.attempts.push({ start: at });
        break;
      case E.ATTEMPT_SUCCESS:
      case E.ATTEMPT_FAILURE: {
        const attempt = step?.attempts.at(-1);
        if(attempt) Object.assign(attempt, { end: at, error: errorText(meta) });
        break;
      }
      case E.STEP_SUCCESS:
        if(step) Object.assign(step, { status: "complete", end: at, result: safe(meta.result) });
        break;
      case E.STEP_FAILURE:
        if(step) Object.assign(step, { status: "errored", end: at, error: errorText(meta) });
        break;
      case E.SLEEP_START:
        steps.set(key, {
          name: stepName(s.target),
          type: "sleep",
          status: "waiting",
          start: at,
          attempts: [],
          detail: typeof meta.durationMs === "number" ? `${Math.round(meta.durationMs / 1000)} s` : undefined
        });
        break;
      case E.SLEEP_COMPLETE:
        if(step) Object.assign(step, { status: "complete", end: at });
        break;
      case E.WAIT_START:
        steps.set(key, { name: stepName(s.target), type: "waitForEvent", status: "waiting", start: at, attempts: [], detail: meta.type ? `event "${meta.type}"` : undefined });
        break;
      case E.WAIT_COMPLETE:
        if(step) Object.assign(step, { status: "complete", end: at, result: safe(meta.result ?? meta.payload) });
        break;
      case E.WAIT_TIMED_OUT:
        if(step) Object.assign(step, { status: "errored", end: at, error: "Timed out waiting for the event" });
        break;
    }
  }
  return [...steps.values()];
}

function summarize(db: Database): (InstanceDetail & { states: StateRow[] }) | undefined {
  const metadata = readKvValue<Metadata>(db, "INSTANCE_METADATA");
  if(!metadata?.instance?.id) return undefined;
  const states = readStates(db);
  const code = readKvValue<number>(db, "ENGINE_STATUS");
  function at(...events: number[]) {
    const row = states.findLast(s => events.includes(s.event) && s.groupKey === null);
    return row ? iso(row.timestamp) : undefined;
  }
  const steps = timeline(states);
  const failure = states.findLast(s => s.event === E.FAILURE);
  return {
    id: metadata.instance.id,
    status: typeof code === "number" ? STATUS[code] ?? "unknown" : states.length ? "running" : "queued",
    created: metadata.instance.created_on,
    started: at(E.START),
    ended: at(E.SUCCESS, E.FAILURE, E.TERMINATED),
    steps: { done: steps.filter(s => s.status === "complete").length, total: steps.length },
    params: safe(metadata.event?.payload),
    output: safe(readKvValue<{ value: unknown }>(db, "WORKFLOW_OUTPUT")?.value),
    error: failure ? errorText(parse(failure.metadata)) : undefined,
    timeline: steps,
    states
  };
}

function engineDir(ctx: HandlerContext) {
  const name = requireResource(ctx).attr?.workflowName;
  if(typeof name !== "string") throw new Error("This Workflow has no name in state yet. Is `alchemy dev` running?");
  return join(localRoot(ctx.root), "workflows", name);
}

function readInstances(ctx: HandlerContext) {
  return listObjects(engineDir(ctx)).flatMap(o => {
    try {
      const s = withObject(o.file, summarize);
      return s ? [s] : [];
    } catch {
      return [];
    }
  });
}

interface WorkflowBinding {
  create(options: { id: string, params?: unknown }): Promise<unknown>,
  get(id: string): {
    status(): Promise<{ status: string, error?: unknown, output?: unknown }>,
    pause(): Promise<void>,
    resume(): Promise<void>,
    terminate(): Promise<void>,
    restart(): Promise<void>,
    sendEvent(event: { type: string, payload?: unknown }): Promise<void>
  }
}

function binding(ctx: HandlerContext) {
  return localBinding<WorkflowBinding>(ctx, requireResource(ctx));
}

const idInput = z.object({ id: z.string().min(1) });

export default defineServer({
  instances: async (_: undefined, ctx): Promise<InstanceSummary[]> => readInstances(ctx)
    .map(({ params: _p, output: _o, error: _e, timeline: _t, states: _s, ...summary }) => summary)
    .sort((a, b) => b.created.localeCompare(a.created)),

  instance: handler(idInput, async (input, ctx): Promise<InstanceDetail | null> => {
    const found = readInstances(ctx).find(i => i.id === input.id);
    if(!found) return null;
    const { states: _states, ...detail } = found;
    return detail;
  }),

  /** Starts an instance with JSON params. The engine runs it in the `alchemy dev` process. */
  create: handler(z.object({ id: z.string().trim().max(100).optional(), params: z.string() }), async (input, ctx) => {
    let params: unknown;
    if(input.params.trim()) {
      try {
        params = JSON.parse(input.params);
      } catch {
        throw new Error("Params must be valid JSON.");
      }
    }
    const id = input.id || crypto.randomUUID();
    const wf = await binding(ctx);
    try {
      await wf.create({ id, params });
    } catch (e) {
      // The instance handle `create` resolves to can't cross the proxy;
      // the instance itself was created.
      if(!(e instanceof Error && /cannot serialize/.test(e.message))) throw e;
    }
    return { id };
  }),

  action: handler(idInput.extend({ action: z.enum(["pause", "resume", "terminate", "restart"]) }), async (input, ctx) => {
    const wf = await binding(ctx);
    await wf.get(input.id)[input.action]();
    return { id: input.id, status: (await wf.get(input.id).status()).status };
  }),

  sendEvent: handler(idInput.extend({ type: z.string().min(1, "Enter the event type"), payload: z.string() }), async (input, ctx) => {
    let payload: unknown;
    if(input.payload.trim()) {
      try {
        payload = JSON.parse(input.payload);
      } catch {
        throw new Error("The payload must be valid JSON.");
      }
    }
    const wf = await binding(ctx);
    await wf.get(input.id).sendEvent({ type: input.type, payload });
    return { id: input.id };
  })
});
