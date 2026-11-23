#!/usr/bin/env bun
/**
 * alchemy-viz [--config <file>] [--stage <stage>] [--port <port>]
 *
 * Run from an Alchemy project while `alchemy dev` is running.
 */
import { parseArgs } from "node:util";
import { cloudflare } from "./plugins/cloudflare/index.ts";
import { startServer } from "./server/http.ts";
import { loadConfig, makeImportFromProject } from "./server/project.ts";

const { values } = parseArgs({
  options: {
    config: { type: "string", short: "c" },
    stage: { type: "string", short: "s" },
    port: { type: "string", short: "p" },
    help: { type: "boolean", short: "h" }
  }
});

if(values.help) {
  console.log(`alchemy-viz: a local dashboard for Alchemy stacks

Usage: alchemy-viz [options]

  -c, --config <file>   Config file (default: alchemy-viz.config.ts if present)
  -s, --stage <stage>   Stage to explore (default: $ALCHEMY_STAGE or dev_$USER)
  -p, --port <port>     Dashboard port (default: 4700, or the next free one)`);
  process.exit(0);
}

if(typeof Bun === "undefined") {
  console.error("alchemy-viz runs on Bun. Start it with `bunx alchemy-viz` or `bun run alchemy-viz`.");
  process.exit(1);
}

const config = await loadConfig({
  cwd: process.cwd(),
  config: values.config,
  stage: values.stage,
  port: values.port ? Number(values.port) : undefined,
  builtins: [cloudflare()]
});

const teardowns: Array<() => void | Promise<void>> = [];
const importFromProject = makeImportFromProject(config.root);
for(const plugin of config.plugins) {
  const teardown = await plugin.setup?.({ root: config.root, importFromProject });
  if(typeof teardown === "function") teardowns.push(teardown);
}

const server = await startServer(config);

try {
  const stack = await server.getStack();
  const local = stack.resources.length;
  console.log(`\n  alchemy-viz  ${stack.name} · ${stack.stage} · ${local} resource${local === 1 ? "" : "s"}`);
} catch (error) {
  console.warn(`\n  Couldn't read the stack yet: ${error instanceof Error ? error.message : error}`);
}
console.log(`  ➜ ${server.url}\n`);

let closing = false;
async function shutdown() {
  if(closing) return;
  closing = true;
  await Promise.allSettled(teardowns.map(t => t()));
  await server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
