# alchemy-viz

A local dashboard for [Alchemy v2](https://alchemy.run) stacks. It lets you browse and edit the resources `alchemy dev` is running: KV keys, D1 tables, R2 objects, and Workers (requests, cron triggers, logs). You can also add pages for your own resource types.

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

Optionally fill the local resources with varied test data (real images and PDFs, a small shop database, KV keys of every shape):

```bash
cd examples/basic && bun run seed
```

In another, start the dashboard:

```bash
cd examples/basic && bun run viz
```

It prints its URL: port 4700, or the next free port if 4700 is taken. The top bar holds the project switcher, Overview, Logs and your custom pages, plus a Resources megamenu listing every resource by provider and type. Press ⌘K anywhere to jump to a resource.

## How it works

- **Resources** come from the stack's state store, read through Alchemy's own `Alchemist.State` API. The stack program never runs and no providers are touched, so it's safe to run next to `alchemy dev` and works with any state store the stack configures.
- **Local data** (KV, D1, R2) is read and written through Alchemy's platform proxy, pointed at `.alchemy/local`. That's the same storage `alchemy dev`'s simulators use, so changes show up in running Workers right away.
- **Logs** come from `.alchemy/log/*.ndjson`. Each line carries the resource's FQN, so every local resource gets a log tab.
- `alchemy`, `effect` and `@alchemy.run/cloudflare-runtime` are always loaded from **your project**, so their versions match the stack.
- The dashboard is served by Vite running inside the CLI, so plugin views are compiled and hot-reloaded like any Vite app. Its cache lives in `.alchemy/alchemy-viz/` and is safe to delete.
- The API only answers the dashboard itself. Requests with another Host, Origin or `Sec-Fetch-Site` are refused, and POSTs must be JSON. Other web pages you visit can't read or change your local data through it.

Resources that only exist in the cloud show a link to the provider's dashboard instead of a local view.

## Stack

| Concern | Library |
| --- | --- |
| Components (tabs, dialogs, select, switch, tree, command, toasts…) | [UI SDK](https://github.com/vercel-labs/ui) (`@ui-sdk/react`) |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query |
| Routing (state in the URL) | TanStack Router |
| Tables | TanStack Table + TanStack Virtual |
| SQL / JSON editing | CodeMirror 6 |
| Read-only highlighting | Shiki |
| Dependency graph | React Flow + ELK |
| Validation | Standard Schema (Zod used internally) |

## Config

`alchemy-viz.config.ts` is optional. Without it you get the built-in plugins.

```ts
import { defineConfig, definePlugin } from "alchemy-viz";
import { cloudflare } from "alchemy-viz/cloudflare";

const acme = definePlugin({
  name: "acme",
  views: [{
    type: "Acme.FeatureFlags",            // the type string from Resource<...>("Acme.FeatureFlags")
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

- `server` and `view` can be a path relative to the config file, an absolute path, a `file:` URL (`new URL("./view.tsx", import.meta.url)` in a published plugin), or a package specifier (`"my-plugin/views/table"`).
- Listing `plugins` replaces the defaults, so include `cloudflare()` if you want it. When two plugins match the same type, the earlier one wins.
- The config is validated at startup, so a mistake names the field that's wrong.
- CLI flags: `--stage`, `--port`, `--config`.

## Writing a view

A view is two files. The server half runs in the alchemy-viz process, with Node APIs and your project's dependencies. Wrap a handler in `handler(schema, fn)` to validate its input with any Standard Schema library (Zod, Effect Schema, Valibot, ArkType…). The browser then gets the schema's input type, and invalid input comes back as a readable error.

```ts
// server.ts
import { defineServer, handler, requireResource } from "alchemy-viz/server";
import { z } from "zod";

export default defineServer({
  items: handler(z.object({ prefix: z.string().default(""), cursor: z.string().optional() }), async (input, ctx) => {
    const { attr } = requireResource(ctx);   // attributes from state
    return listItems(attr.id, input.prefix, input.cursor);   // { items, cursor }
  }),
  reset: handler(z.object({ hard: z.boolean() }), async (input, ctx) => { /* ... */ })
});
```

A handler returns JSON, a `Response` (sent as-is, e.g. a download), or an Effect. Edits to server files apply on the next call.

The browser half gets a typed `api`, backed by TanStack Query:

```tsx
// view.tsx
import { defineView, useUrlState } from "alchemy-viz/client";
import { ConfirmButton, DataTable, Panel } from "alchemy-viz/ui";
import type server from "./server.ts";

export default defineView<typeof server>(({ resource, api }) => {
  const [selected, setSelected] = useUrlState("item");        // kept in the URL
  const pages = api.items.useInfiniteQuery({ prefix: "" }, { getNextCursor: p => p.cursor });
  const reset = api.reset.useMutation();
  return (
    <Panel title={resource.logicalId} actions={<ConfirmButton title="Reset?" onConfirm={() => reset.mutateAsync({ hard: true })}>Reset</ConfirmButton>} flush>
      <DataTable
        rows={pages.data?.pages.flatMap(p => p.items)}
        columns={[{ id: "id", header: "ID" }, { id: "name", header: "Name" }]}
        getRowId={r => r.id}
        selectedId={selected}
        onRowClick={r => setSelected(r.id)}
        hasMore={pages.hasNextPage}
        onEndReached={() => pages.fetchNextPage()}
      />
    </Panel>
  );
});
```

Each handler on `api` has:

- `useQuery(input, options?)`
- `useInfiniteQuery(input, { getNextCursor })`: calls the handler with `{ ...input, cursor }` for each page.
- `useMutation(options?)`: a successful call refetches that resource's queries.
- `call(input)`, `key(input)` (its query key), and `url(input)` (a GET URL for `<img src>` or downloads).

Other helpers:

- `useUrlState(name)` keeps view state in the query string, so reloads and shared links open the same place.
- `ResourceLink` and `useOpenResource()` navigate to other resources.

Pages work the same way with `definePage`, minus `resource`.

## UI kit

`alchemy-viz/ui` is what the dashboard itself is built from. Tailwind styles it on top of UI SDK components:

- **Layout:** `Page`, `Panel`, `Split`, `KeyValueList`, `Kbd`
- **Controls:** `Button` (shows a spinner while the Promise from `onClick` is pending), `LinkButton`, `IconButton`, `ConfirmButton`, `Dialog*`
- **Forms:** `Field`, `FieldLabel`, `Input`, `SearchInput`, `Textarea`, `Select`, `Switch`, `SegmentedControl`
- **Tabs:** `Tabs`, `TabsList`, `TabsTab`, `TabsPanel`, `TabCount`
- **Data:** `DataTable` (sortable, resizable, virtualized, infinite), `JsonInspector`, `CodeEditor`, `CodeBlock`, `LogView`
- **Feedback:** `Badge`, `StatusPill`, `Banner`, `ErrorBanner`, `EmptyState`, `ExternalLinkCard`, `Loading`, `Skeleton`, `toast`
- **Helpers:** `cn`, `formatBytes`, `formatTime`

For your own markup, use Tailwind with the theme's tokens: `bg-surface`, `bg-surface-2`, `text-fg-muted`, `border-line`, `bg-accent-soft`, `text-danger`, and so on. They follow light and dark mode on their own. Tailwind picks up classes in plugin files automatically, wherever they live.

## Built-in Cloudflare views

| Resource | View |
| --- | --- |
| KV namespace | Key list with prefix filter and infinite scroll; view, edit (⌘↵ to save), create and delete values and metadata |
| D1 database | Table browser with infinite scroll; SQL console with table/column autocomplete |
| R2 bucket | Folder browser, previews (images, highlighted text), upload, download, delete |
| Worker | URL, request tool, cron "Trigger now", bindings linked to their resources |

Every resource also gets **Details** (attributes, props, bindings, dependencies) and **Logs**.

Not yet covered: Durable Objects, Workflows, Queues, email handlers.
