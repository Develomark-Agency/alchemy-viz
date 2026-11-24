/**
 * The dashboard server: a JSON API under `/__viz/api/*` in front of a Vite
 * dev server (middleware mode) that serves the React shell and compiles
 * plugin views.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer as createVite } from "vite";
import type { ResourceInfo, StackInfo } from "../types.ts";
import { type HandlerContext, InputError } from "./define.ts";
import { readLogs } from "./logs.ts";
import { type LoadedConfig, makeImportFromProject, viewsFor } from "./project.ts";
import { registryPlugin, tailwindSourcesPlugin } from "./registry-plugin.ts";
import { callHandler } from "./rpc.ts";
import { makeStackReader } from "./stack.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../client/app");
const stylesheet = join(appRoot, "app.css");
const packageRoot = resolve(here, "../..");

// One copy of each for the shell and every plugin view, or hooks and
// contexts (React, Query, Router) stop working across the boundary.
const SHARED = [
  "react",
  "react-dom",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@ui-sdk/react",
  "@ui-sdk/core"
];

/** Public, JSON-safe view of the plugin set, for the shell. */
function pluginMeta(config: LoadedConfig, stack: StackInfo) {
  return Object.fromEntries(stack.resources.map((r: ResourceInfo) => {
    const views = viewsFor(config.views, r);
    const plugin = views[0] ? config.plugins.find(p => p.name === views[0]!.plugin) : undefined;
    // Link and locality come from the first plugin that answers, even one
    // without a view for this type.
    const link = config.plugins.map(p => safe(() => p.link?.(r))).find(Boolean);
    const local = plugin?.isLocal ? safe(() => plugin.isLocal!(r)) ?? true : true;
    return [r.fqn, { viewIds: views.map(v => v.id), link, local }];
  }));
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((ok, fail) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", c => (body += c));
    req.on("end", () => ok(body));
    req.on("error", fail);
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * The API reads and writes local data, so only the dashboard itself may call
 * it. The Host check stops DNS rebinding; `Sec-Fetch-Site` stops other
 * pages (including other localhost ports) from sending requests, even
 * "simple" ones like an `<img>` pointing at a GET handler; requiring JSON
 * on POST forces a CORS preflight that this server never answers.
 */
function rejectForeign(req: IncomingMessage, port: number): string | undefined {
  const host = req.headers.host ?? "";
  if(host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) return `Unexpected Host '${host}'.`;
  const site = req.headers["sec-fetch-site"];
  if(site !== undefined && site !== "same-origin" && site !== "none") return "Cross-site requests are not allowed.";
  const origin = req.headers.origin;
  if(origin !== undefined && origin !== `http://${host}`) return `Unexpected Origin '${origin}'.`;
  if(req.method === "POST" && !req.headers["content-type"]?.startsWith("application/json")) {
    return "POST requests must send application/json.";
  }
  return undefined;
}

function canListen(port: number, host: string) {
  return new Promise<boolean>(ok => {
    const probe = createNetServer();
    probe.once("error", (error: NodeJS.ErrnoException) => ok(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
    probe.listen(port, host, () => probe.close(() => ok(true)));
  });
}

/**
 * The first port free on both IPv4 and IPv6 loopback, so "localhost" can't
 * resolve to another app (Astro's dev server, say) on the other family.
 */
async function findPort(start: number, strict: boolean) {
  for(let port = start; port < start + 50; port++) {
    if((await canListen(port, "127.0.0.1")) && (await canListen(port, "::1"))) return port;
    if(strict) throw new Error(`Port ${port} is in use. Pick another with --port.`);
  }
  throw new Error(`No free port between ${start} and ${start + 49}.`);
}

export async function startServer(config: LoadedConfig) {
  const port = await findPort(config.port, config.strictPort);
  const readStack = makeStackReader(config.root, config.entrypoint);
  const importFromProject = makeImportFromProject(config.root);
  let stage = config.stage;

  // Reads are cheap (~ms after the first), but a burst of view calls
  // shouldn't each re-read state.
  let cached: { at: number, stage: string, value: Promise<StackInfo> } | undefined;
  function getStack(fresh = false) {
    if(fresh || !cached || cached.stage !== stage || Date.now() - cached.at > 1000) {
      cached = { at: Date.now(), stage, value: readStack(stage) };
      cached.value.catch(() => (cached = undefined));
    }
    return cached.value;
  }

  function contextFor(stack: StackInfo, resource: ResourceInfo | undefined): HandlerContext {
    return { resource, stack, root: config.root, importFromProject };
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    const path = url.pathname.slice("/__viz/api".length);

    if(path === "/stack" && req.method === "GET") {
      const requested = url.searchParams.get("stage");
      if(requested) stage = requested;
      const stack = await getStack(url.searchParams.has("fresh"));
      return sendJson(res, 200, {
        stack,
        meta: pluginMeta(config, stack),
        pages: config.pages.map(({ id, route, title, plugin }) => ({ id, route, title, plugin }))
      });
    }

    if(path === "/logs" && req.method === "GET") {
      const lines = await readLogs(config.root, {
        fqn: url.searchParams.get("fqn") ?? undefined,
        since: Number(url.searchParams.get("since") ?? 0) || undefined,
        limit: Number(url.searchParams.get("limit") ?? 500)
      });
      return sendJson(res, 200, { lines });
    }

    // POST /rpc {target, handler, input} → JSON, or the handler's Response.
    // GET  /rpc?target&handler&input=<json> → same; for links and downloads.
    if(path === "/rpc" && (req.method === "POST" || req.method === "GET")) {
      const call = req.method === "POST"
        ? JSON.parse((await readBody(req)) || "{}")
        : {
          target: JSON.parse(url.searchParams.get("target") ?? "{}"),
          handler: url.searchParams.get("handler"),
          input: JSON.parse(url.searchParams.get("input") ?? "null")
        };
      const target: { fqn?: string, view?: string, page?: string } = call.target ?? {};
      const stack = await getStack();
      let file: string | undefined;
      let resource: ResourceInfo | undefined;
      if(target.fqn) {
        resource = stack.resources.find(r => r.fqn === target.fqn);
        if(!resource) return sendJson(res, 404, { error: `No resource '${target.fqn}' in stage ${stack.stage}.` });
        const views = viewsFor(config.views, resource);
        file = (views.find(v => v.id === target.view) ?? views[0])?.server;
      } else if(target.page) {
        file = config.pages.find(p => p.id === target.page)?.server;
      }
      if(!file) return sendJson(res, 404, { error: "This view has no server module." });
      const result = await callHandler(file, call.handler, call.input ?? undefined, contextFor(stack, resource));
      if(result instanceof Response) return sendResponse(res, result);
      return sendJson(res, 200, { result: result ?? null });
    }

    return sendJson(res, 404, { error: `Unknown endpoint ${req.method} ${path}` });
  }

  // Created first so Vite's hot-reload websocket can share it instead of
  // opening its own fixed port.
  const server = createServer();

  const vite = await createVite({
    configFile: false,
    root: appRoot,
    appType: "spa",
    // The cache lives next to Alchemy's own state: ephemeral, gitignored.
    cacheDir: join(config.root, ".alchemy", "alchemy-viz", "vite"),
    plugins: [
      tailwindSourcesPlugin(stylesheet, config.views, config.pages),
      tailwind(),
      react(),
      registryPlugin(config.views, config.pages)
    ],
    resolve: { dedupe: SHARED },
    // Views load lazily through the registry, which Vite's dependency scan
    // can't see into. Scanning them up front pre-bundles everything in one
    // pass; a dependency found later is bundled separately, and libraries
    // that check `instanceof` across packages (CodeMirror) then break.
    optimizeDeps: {
      entries: [join(appRoot, "index.html"), ...[...config.views, ...config.pages].map(entry => entry.view)],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "elkjs/lib/elk.bundled.js",
        // Found late they'd trigger a re-bundle mid-session, and an open tab would mix two copies of React.
        "motion/react",
        "cn",
        "@uiw/react-codemirror",
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/lang-sql",
        "@codemirror/lang-json",
        "@lezer/highlight"
      ]
    },
    server: {
      middlewareMode: true,
      hmr: { server },
      fs: {
        allow: [config.root, packageRoot, ...[...config.views, ...config.pages].map(entry => dirname(entry.view))]
      }
    },
    // VIZ_DEBUG=1 shows Vite's own output, such as dependencies it finds late.
    logLevel: process.env.VIZ_DEBUG ? "info" : "warn"
  });

  server.on("request", async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if(url.pathname.startsWith("/__viz/api/")) {
      const refusal = rejectForeign(req, port);
      if(refusal) return sendJson(res, 403, { error: refusal });
      try {
        await api(req, res, url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if(!res.headersSent) sendJson(res, error instanceof InputError || error instanceof SyntaxError ? 400 : 500, { error: message });
      }
      return;
    }
    vite.middlewares(req, res);
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ok());
  });

  return {
    url: `http://localhost:${port}`,
    getStack,
    close: async () => {
      await vite.close();
      await new Promise(ok => server.close(ok));
    }
  };
}
