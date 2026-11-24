# alchemy-viz

A local dashboard for [Alchemy v2](https://alchemy.run) stacks. Browse and edit the resources `alchemy dev` is running: KV keys, D1 tables, R2 objects, Durable Object storage, queue messages, Workflow instances, Secrets Store values, containers, sent email, Hyperdrive databases and Workers. Turso databases, groups and tokens get views too. You can add pages for your own resource types.

## Install

Each [GitHub Release](https://github.com/Develomark-Agency/alchemy-viz/releases) has the package tarball attached. Install it into an Alchemy v2 project from its URL, with `X.Y.Z` being the version (each release's notes show its exact command):

```bash
bun add --dev https://github.com/Develomark-Agency/alchemy-viz/releases/download/vX.Y.Z/alchemy-viz-X.Y.Z.tgz
# or
npm install --save-dev https://github.com/Develomark-Agency/alchemy-viz/releases/download/vX.Y.Z/alchemy-viz-X.Y.Z.tgz
```

It runs on **Node 22.22.3, 24.11.1 or newer**, or **Bun**. `alchemy` and `effect` are peer dependencies: alchemy-viz uses your project's copies, so they match your stack.

## Run

Start your stack with `alchemy dev`, then in another terminal:

```bash
npx alchemy-viz        # Node
bunx --bun alchemy-viz # Bun
```

It prints its URL: port 4700, or the next free one.

| Flag | |
| --- | --- |
| `--stage`, `-s` | Stage to explore (default `dev_$USER`, or `ALCHEMY_STAGE`) |
| `--port`, `-p` | Dashboard port |
| `--config`, `-c` | Config file (default `alchemy-viz.config.ts`, if present) |

## Configure and extend

`alchemy-viz.config.ts` is optional. Without it you get the built-in Cloudflare and Turso views.

```ts
import { defineConfig, definePlugin } from "alchemy-viz";
import { cloudflare } from "alchemy-viz/cloudflare";

const acme = definePlugin({
  name: "acme",
  views: [{ type: "Acme.FeatureFlags", title: "Flags", server: "./viz/flags/server.ts", view: "./viz/flags/view.tsx" }]
});

export default defineConfig({ plugins: [cloudflare(), acme] });
```

A view is a server module (`alchemy-viz/server`) that runs in the dashboard process with your project's dependencies, and a React component (`alchemy-viz/client`, with the `alchemy-viz/ui` kit) that gets a typed API for it. Both can be TypeScript.

The [full documentation](https://github.com/Develomark-Agency/alchemy-viz#readme) covers the config, writing views and pages, the UI kit, and every built-in view.

## License

MIT
