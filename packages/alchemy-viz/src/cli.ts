#!/usr/bin/env node
/**
 * The `alchemy-viz` command. Run it from an Alchemy project while
 * `alchemy dev` is running. Runs on Node (22.22.3, 24.11.1 or newer) and Bun.
 */
import "./node-warnings.ts";
import { command, extendType, number, option, optional, run, string } from "cmd-ts";
import pkg from "../package.json" with { type: "json" };
import { cloudflare } from "./plugins/cloudflare/index.ts";
import { turso } from "./plugins/turso/index.ts";
import { startServer } from "./server/http.ts";
import { loadConfig, makeImportFromProject } from "./server/project.ts";

/** A TCP port: a whole number from 1 to 65535. */
const Port = extendType(number, {
  displayName: "port",
  async from(value) {
    if(!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`Expected a port from 1 to 65535, got ${value}.`);
    return value;
  }
});

const cli = command({
  name: "alchemy-viz",
  version: pkg.version,
  description: "A local dashboard for exploring and interacting with Alchemy stacks. Run it from an Alchemy project while `alchemy dev` is running.",
  args: {
    config: option({
      type: optional(string),
      long: "config",
      short: "c",
      description: "Config file (default: alchemy-viz.config.ts, if present)"
    }),
    stage: option({
      type: optional(string),
      long: "stage",
      short: "s",
      env: "ALCHEMY_STAGE",
      description: "Stage to explore (default: dev_$USER)"
    }),
    port: option({
      type: optional(Port),
      long: "port",
      short: "p",
      description: "Dashboard port (default: 4700, or the next free one)"
    })
  },
  examples: [
    { description: "Explore the current project", command: "alchemy-viz" },
    { description: "Explore another stage on a fixed port", command: "alchemy-viz --stage prod --port 5000" }
  ],
  handler: async args => {
    const config = await loadConfig({
      cwd: process.cwd(),
      config: args.config,
      stage: args.stage,
      port: args.port,
      builtins: [cloudflare(), turso()]
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
      const count = stack.resources.length;
      console.log(`\n  alchemy-viz  ${stack.name} (${stack.stage}), ${count} resource${count === 1 ? "" : "s"}`);
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
  }
});

await run(cli, process.argv.slice(2));
