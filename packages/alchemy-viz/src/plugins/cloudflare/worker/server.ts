import { defineServer, type HandlerContext, requireResource } from "../../../server/define.ts";

const BODY_LIMIT = 200_000;

function workerUrl(ctx: HandlerContext) {
  const url = requireResource(ctx).attr?.url;
  if(typeof url !== "string") throw new Error("This Worker has no URL in state yet. Is `alchemy dev` running?");
  return url;
}

async function readBody(res: Response) {
  const text = await res.text();
  return text.length > BODY_LIMIT ? { body: text.slice(0, BODY_LIMIT), truncated: true } : { body: text, truncated: false };
}

export default defineServer({
  /** Send an HTTP request to the local Worker and return the full response. */
  request: async (input: { method: string, path: string, headers?: Record<string, string>, body?: string }, ctx) => {
    const base = workerUrl(ctx);
    const url = new URL(input.path || "/", base);
    const started = performance.now();
    const res = await fetch(url, {
      method: input.method,
      headers: input.headers,
      body: ["GET", "HEAD"].includes(input.method) ? undefined : input.body,
      redirect: "manual"
    });
    const durationMs = Math.round(performance.now() - started);
    return {
      url: url.toString(),
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      durationMs,
      ...(await readBody(res))
    };
  },

  /** Fire the Worker's `scheduled()` handler, as a cron trigger would. */
  trigger: async (input: { cron: string }, ctx) => {
    const url = new URL("/cdn-cgi/handler/scheduled", workerUrl(ctx));
    url.searchParams.set("cron", input.cron);
    const res = await fetch(url);
    return { status: res.status, ...(await readBody(res)), at: new Date().toISOString() };
  }
});
