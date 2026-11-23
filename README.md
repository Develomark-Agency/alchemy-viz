# alchemy-viz

A local dashboard for [Alchemy v2](https://alchemy.run) stacks: browse and edit the resources `alchemy dev` is running — KV keys, D1 tables, R2 objects, Workers (requests, cron triggers, logs) — and add pages for your own resource types.

```
packages/alchemy-viz   the library: CLI, server, dashboard, UI kit, built-in Cloudflare plugin
examples/basic         a test Alchemy project (Worker + KV + D1 + R2 + a custom resource)
```

## Try it

```bash
bun install
```

In one terminal, start the example stack:

```bash
cd examples/basic && bun run dev
```

In another, start the dashboard:

```bash
cd examples/basic && bun run viz
```

Open <http://localhost:4321>.

## How it works

- **Resources** come from the stack's state store, read through Alchemy's own `Alchemist.State` API. The stack program never runs and providers are never touched, so it is safe alongside `alchemy dev` and works with any state store the stack configures.
- **Local data** (KV, D1, R2) is read and written through Alchemy's platform proxy over `.alchemy/local`, the same storage `alchemy dev`'s simulators use. Changes show up in running Workers immediately.
- **Logs** come from `.alchemy/log/*.ndjson`; lines carry the resource FQN, so every local resource gets a log tab.
- `alchemy`, `effect` and `@alchemy.run/cloudflare-runtime` are always loaded from **your project**, so versions match the stack.
- The Vite cache lives in `.alchemy/alchemy-viz/` and is safe to delete.

Resources that only exist in the cloud show a link to the provider's dashboard instead of a local view.

## Config

`alchemy-viz.config.ts` (optional; without it you get the built-in plugins):

```ts
import { defineConfig, definePlugin } from "alchemy-viz";
import { cloudflare } from "alchemy-viz/cloudflare";

const acme = definePlugin({
  name: "acme",
  views: [{
    type: "Acme.FeatureFlags",            // resource type string from Resource<...>("Acme.FeatureFlags")
    title: "Flags",
    server: "./viz/feature-flags/server.ts",
    view: "./viz/feature-flags/view.tsx"
  }],
  pages: [{ route: "traffic", title: "Traffic", server: "./viz/traffic/server.ts", view: "./viz/traffic/page.tsx" }]
});

export default defineConfig({
  stack: "./alchemy.run.ts",
  plugins: [cloudflare(), acme]
});
```

Listing `plugins` replaces the defaults, so include `cloudflare()` if you want it. Earlier plugins win when two match the same type. CLI flags: `--stage`, `--port`, `--config`.

## Writing a view

A view is two files. The server half runs in the alchemy-viz process (Node APIs, your project's dependencies):

```ts
// server.ts
import { defineServer, requireResource } from "alchemy-viz/server";

export default defineServer({
  items: async (input: { prefix?: string }, ctx) => {
    const { attr } = requireResource(ctx);   // attributes from state
    return listItems(attr.id, input.prefix);
  },
  reset: async (input: { hard: boolean }, ctx) => { /* ... */ }
});
```

Handlers take JSON and return JSON, a `Response` (streamed as-is, e.g. downloads), or an Effect. Edits to server files apply on the next call.

The browser half gets a typed `api`:

```tsx
// view.tsx
import { defineView } from "alchemy-viz/client";
import { ActionButton, DataTable, Panel } from "alchemy-viz/ui";
import type server from "./server.ts";

export default defineView<typeof server>(({ resource, api }) => {
  const items = api.items.useQuery({ prefix: "" });
  const reset = api.reset.useMutation();
  return (
    <Panel title={resource.logicalId} actions={<ActionButton confirm onAction={() => reset.run({ hard: true })}>Reset</ActionButton>} flush>
      <DataTable rows={items.data} loading={items.loading} error={items.error} rowKey={r => r.id} columns={[{ key: "id", header: "ID" }]} />
    </Panel>
  );
});
```

Each handler exposes `useQuery(input)`, `useMutation()`, `call(input)` and `url(input)` (a GET URL for `<img src>` or downloads). Successful mutations refetch the view's queries automatically.

Pages work the same with `definePage`, minus `resource`.

## UI kit

`alchemy-viz/ui` is what the dashboard itself is built from: `Page`, `Panel`, `Split`, `Tabs`, `Stack`, `Row`, `Button`, `ActionButton`, `LinkButton`, `Input`, `Select`, `Toggle`, `CodeEditor`, `Field`, `DataTable`, `KeyValueList`, `JsonInspector`, `LogStream`, `Badge`, `StatusPill`, `Modal`, `EmptyState`, `Banner`, `ErrorBanner`, `ExternalLinkCard`, plus `formatBytes` / `formatTime`. Styling uses `--av-*` CSS variables that follow light and dark mode; use them in custom CSS to match.

## Built-in Cloudflare views

| Resource | View |
| --- | --- |
| KV namespace | Key list with prefix filter and pagination; view, edit, create and delete values and metadata |
| D1 database | Table browser with paging; SQL console |
| R2 bucket | Folder browser, previews (text, images), upload, download, delete |
| Worker | URL, request tool, cron "trigger now", bindings linked to their resources |

Every resource also gets **Details** (attributes, props, bindings, dependencies) and **Logs**.

Not yet covered: Durable Objects, Workflows, Queues, email handlers.
