import { defineServer } from "alchemy-viz/server";

const PATHS = ["/", "/users", "/upload", "/missing"];

export default defineServer({
  /** Fire a burst of requests at the Api worker to generate data and logs. */
  send: async (input: { count: number }, ctx) => {
    const api = ctx.stack.resources.find(r => r.type === "Cloudflare.Worker");
    if(!api?.attr.url) throw new Error("No local Worker URL. Is `alchemy dev` running?");
    const results: Record<string, number> = {};
    for(let i = 0; i < Math.min(input.count, 200); i++) {
      const path = PATHS[i % PATHS.length]!;
      const res = await fetch(new URL(path, api.attr.url));
      await res.arrayBuffer();
      const k = `${path} → ${res.status}`;
      results[k] = (results[k] ?? 0) + 1;
    }
    return Object.entries(results).map(([route, count]) => ({ route, count }));
  }
});
