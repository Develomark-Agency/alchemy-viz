/**
 * The dashboard server: a JSON API under `/__viz/api/*` in front of a Vite
 * dev server (middleware mode) that serves the React shell and compiles
 * plugin views.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer as createVite } from "vite";
import type { ResourceInfo, StackInfo } from "../types.ts";
import type { HandlerContext } from "./define.ts";
import { readLogs } from "./logs.ts";
import { type LoadedConfig, makeImportFromProject, viewFor } from "./project.ts";
import { registryPlugin } from "./registry-plugin.ts";
import { callHandler } from "./rpc.ts";
import { makeStackReader } from "./stack.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../client/app");
const packageRoot = resolve(here, "../..");

/** Public, JSON-safe view of the plugin set, for the shell. */
function pluginMeta(config: LoadedConfig, stack: StackInfo) {
  return Object.fromEntries(
    stack.resources.map((r: ResourceInfo) => {
      const view = viewFor(config.views, r.type);
      const plugin = view ? config.plugins.find(p => p.name === view.plugin) : undefined;
      // Link and locality come from the first plugin that answers, even one
      // without a view for this type.
      const link = config.plugins.map(p => safe(() => p.link?.(r))).find(Boolean);
      const local = plugin?.isLocal ? safe(() => plugin.isLocal!(r)) ?? true : true;
      return [r.fqn, { viewId: view?.id, link, local }];
    })
  );
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

export async function startServer(config: LoadedConfig) {
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
    return {
      resource,
      stack,
      root: config.root,
      importFromProject
    };
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
    // GET  /rpc?target&handler&input=<json> → same; used for links/downloads.
    if(path === "/rpc") {
      const call =
        req.method === "POST"
          ? JSON.parse((await readBody(req)) || "{}")
          : {
            target: JSON.parse(url.searchParams.get("target") ?? "{}"),
            handler: url.searchParams.get("handler"),
            input: JSON.parse(url.searchParams.get("input") ?? "null")
          };
      const target: { fqn?: string, page?: string } = call.target ?? {};
      const stack = await getStack();
      let file: string | undefined;
      let resource: ResourceInfo | undefined;
      if(target.fqn) {
        resource = stack.resources.find(r => r.fqn === target.fqn);
        if(!resource) return sendJson(res, 404, { error: `No resource '${target.fqn}' in stage ${stack.stage}.` });
        file = viewFor(config.views, resource.type)?.server;
      } else if(target.page) {
        file = config.pages.find(p => p.id === target.page)?.server;
      }
      if(!file) return sendJson(res, 404, { error: "This view has no server module." });
      const result = await callHandler(file, call.handler, call.input, contextFor(stack, resource));
      if(result instanceof Response) return sendResponse(res, result);
      return sendJson(res, 200, { result: result ?? null });
    }

    return sendJson(res, 404, { error: `Unknown endpoint ${path}` });
  }

  const vite = await createVite({
    configFile: false,
    root: appRoot,
    appType: "spa",
    // The cache lives next to Alchemy's own state: ephemeral, gitignored.
    cacheDir: join(config.root, ".alchemy", "alchemy-viz", "vite"),
    plugins: [react(), registryPlugin(config.views, config.pages)],
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"] },
    server: {
      middlewareMode: true,
      fs: { allow: [config.root, packageRoot, ...config.views.map(v => dirname(v.view)), ...config.pages.map(p => dirname(p.view))] }
    },
    logLevel: "warn"
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if(url.pathname.startsWith("/__viz/api/")) {
      try {
        await api(req, res, url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if(!res.headersSent) sendJson(res, 500, { error: message });
      }
      return;
    }
    vite.middlewares(req, res);
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(config.port, "127.0.0.1", () => ok());
  });

  return {
    url: `http://localhost:${config.port}`,
    getStack,
    close: async () => {
      await vite.close();
      await new Promise(ok => server.close(ok));
    }
  };
}
