import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import { readLogs } from "../../../server/logs.ts";
import type { ResourceInfo } from "../../../types.ts";
import { localBinding } from "../runtime.ts";

interface QueueProducer {
  send(body: unknown, options?: { contentType?: "json" | "text" | "bytes" | "v8", delaySeconds?: number }): Promise<void>,
  sendBatch(messages: Array<{ body: unknown, contentType?: "json" | "text", delaySeconds?: number }>): Promise<void>
}

export interface Consumer {
  fqn: string,
  /** The consuming Worker, when it's part of this stack. */
  worker?: string,
  scriptName?: string,
  settings: Record<string, unknown>,
  deadLetterQueue?: string
}

function workerByScript(resources: ResourceInfo[], scriptName: unknown) {
  return resources.find(r => r.type === "Cloudflare.Worker" && r.attr?.workerName === scriptName);
}

function bindsQueue(worker: ResourceInfo, queueId: string) {
  return worker.bindings.some(b => ((b.data as { bindings?: Array<Record<string, unknown>> })?.bindings ?? [])
    .some(x => x.type === "queue" && x.queueId === queueId));
}

function wiring(ctx: HandlerContext) {
  const queue = requireResource(ctx);
  const { queueId, queueName } = queue.attr ?? {};
  const resources = ctx.stack.resources;
  const consumers: Consumer[] = resources
    .filter(r => r.type === "Cloudflare.Queues.Consumer" && r.attr?.queueId === queueId)
    .map(r => ({
      fqn: r.fqn,
      worker: workerByScript(resources, r.attr?.scriptName)?.fqn,
      scriptName: r.attr?.scriptName,
      settings: r.attr?.settings ?? r.props?.settings ?? {},
      deadLetterQueue: r.attr?.deadLetterQueue ?? r.props?.deadLetterQueue
    }));
  const producers = resources.filter(r => r.type === "Cloudflare.Worker" && bindsQueue(r, queueId)).map(r => r.fqn);
  // Queues that dead-letter into this one.
  const deadLetterFor = resources
    .filter(r => r.type === "Cloudflare.Queues.Consumer" && (r.attr?.deadLetterQueue ?? r.props?.deadLetterQueue) === queueName)
    .map(r => resources.find(q => q.type === "Cloudflare.Queues.Queue" && q.attr?.queueId === r.attr?.queueId)?.fqn)
    .filter((x): x is string => !!x);
  return { consumers, producers, deadLetterFor };
}

export default defineServer({
  overview: async (_: undefined, ctx) => wiring(ctx),

  /** Sends one message (or several copies) to the queue, as a producer binding would. */
  send: handler(
    z.object({
      body: z.string(),
      contentType: z.enum(["json", "text"]),
      delaySeconds: z.number().int().min(0).max(86_400).optional(),
      copies: z.number().int().min(1).max(100).default(1)
    }),
    async (input, ctx) => {
      let body: unknown = input.body;
      if(input.contentType === "json") {
        try {
          body = JSON.parse(input.body);
        } catch {
          throw new Error("The body isn't valid JSON. Fix it, or send it as text.");
        }
      }
      const queue = await localBinding<QueueProducer>(ctx, requireResource(ctx));
      const options = { contentType: input.contentType, delaySeconds: input.delaySeconds || undefined };
      if(input.copies === 1) await queue.send(body, options);
      else await queue.sendBatch(Array.from({ length: input.copies }, () => ({ body, ...options })));
      return { sent: input.copies, at: new Date().toISOString(), consumers: wiring(ctx).consumers.length };
    }
  ),

  /** Recent log lines from the Workers that consume this queue. */
  activity: handler(z.object({ since: z.number().optional() }), async (input, ctx) => {
    const workers = wiring(ctx).consumers.map(c => c.worker).filter((x): x is string => !!x);
    const lines = (await Promise.all(workers.map(fqn => readLogs(ctx.root, { fqn, since: input.since, limit: 200 })))).flat();
    return lines.sort((a, b) => a.time - b.time).slice(-200);
  })
});
