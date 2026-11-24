import { DurableObject, WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { ApiEnv } from "../alchemy.run.ts";

export interface Job {
  kind: string,
  payload?: unknown
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    await env.DB.prepare("INSERT INTO visits (path) VALUES (?)").bind(url.pathname).run();

    switch(url.pathname) {
      case "/": {
        const hits = Number((await env.CACHE.get("hits")) ?? "0") + 1;
        await env.CACHE.put("hits", String(hits));
        await env.CACHE.put(`visit:${Date.now()}`, JSON.stringify({ path: url.pathname, ua: request.headers.get("user-agent") }), {
          metadata: { source: "fetch" }
        });
        return Response.json({ greeting: env.GREETING, hits });
      }
      case "/users":
        return Response.json((await env.DB.prepare("SELECT * FROM users").all()).results);
      case "/upload": {
        const name = url.searchParams.get("name") ?? `note-${Date.now()}.txt`;
        await env.UPLOADS.put(name, request.method === "POST" ? await request.text() : `uploaded at ${new Date().toISOString()}`, {
          httpMetadata: { contentType: "text/plain" }
        });
        return Response.json({ uploaded: name });
      }
      case "/jobs": {
        const job: Job = { kind: url.searchParams.get("kind") ?? "email", payload: { at: Date.now() } };
        await env.JOBS.send(job);
        return Response.json({ queued: job });
      }
      case "/counter": {
        const name = url.searchParams.get("name") ?? "global";
        const count = await env.COUNTER.getByName(name).increment(url.pathname);
        return Response.json({ name, count });
      }
      case "/onboard": {
        const email = url.searchParams.get("email") ?? "ada@example.com";
        const instance = await env.ONBOARDING.create({ params: { email } });
        return Response.json({ id: instance.id, status: await instance.status() });
      }
      case "/secret": {
        // InferEnv has no mapping for Secrets Store secrets yet; the binding is a `SecretsStoreSecret`.
        const key = await (env.API_KEY as unknown as { get(): Promise<string> }).get();
        return Response.json({ apiKey: `${key.slice(0, 7)}…` });
      }
      default:
        return new Response("not found", { status: 404 });
    }
  },
  async scheduled(controller, env) {
    await env.CACHE.put("last-cron", new Date(controller.scheduledTime).toISOString());
    console.log("cron ran", controller.cron);
  },
  async queue(batch, env) {
    for(const message of batch.messages) {
      const job = message.body as Job;
      if(job.kind === "fail") {
        console.warn("job failed, retrying", message.id, `attempt ${message.attempts}`);
        message.retry();
        continue;
      }
      await env.CACHE.put(`job:${message.id}`, JSON.stringify({ ...job, doneAt: new Date().toISOString() }));
      console.log("job done", job.kind, message.id);
      message.ack();
    }
  }
} satisfies ExportedHandler<ApiEnv>;

/** A SQLite-backed counter per name, with a log of every hit. */
export class Counter extends DurableObject<ApiEnv> {
  constructor(ctx: DurableObjectState, env: ApiEnv) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, path TEXT, at TEXT)");
  }

  async increment(path: string) {
    const count = ((await this.ctx.storage.get<number>("count")) ?? 0) + 1;
    await this.ctx.storage.put("count", count);
    await this.ctx.storage.put("lastHit", { path, at: new Date().toISOString() });
    this.ctx.storage.sql.exec("INSERT INTO hits (path, at) VALUES (?, ?)", path, new Date().toISOString());
    return count;
  }

  async get() {
    return (await this.ctx.storage.get<number>("count")) ?? 0;
  }
}

/** Welcomes a new user: a few steps with a pause in the middle. */
export class Onboarding extends WorkflowEntrypoint<ApiEnv, { email: string }> {
  async run(event: WorkflowEvent<{ email: string }>, step: WorkflowStep) {
    const user = await step.do("create profile", async () => ({ email: event.payload.email, createdAt: new Date().toISOString() }));
    await step.do("send welcome email", async () => {
      console.log("welcome email to", user.email);
      return { sent: true };
    });
    await step.sleep("wait before nudge", "20 seconds");
    return await step.do("send nudge", async () => ({ nudged: user.email }));
  }
}
