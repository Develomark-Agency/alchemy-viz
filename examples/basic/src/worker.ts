import type { ApiEnv } from "../alchemy.run.ts";

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
      default:
        return new Response("not found", { status: 404 });
    }
  },
  async scheduled(controller, env) {
    await env.CACHE.put("last-cron", new Date(controller.scheduledTime).toISOString());
    console.log("cron ran", controller.cron);
  }
} satisfies ExportedHandler<ApiEnv>;
