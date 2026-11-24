# alchemy-viz

A local dashboard for [Alchemy v2](https://alchemy.run) stacks. It lets you browse and edit the resources `alchemy dev` is running: KV keys, D1 tables, R2 objects, Durable Object storage, queue messages, Workflow instances, Secrets Store values, containers, sent email, and Workers (requests, cron triggers, logs). Turso databases, groups and tokens get views too, against Turso Cloud. You can also add pages for your own resource types.

## Install

In an Alchemy v2 project:

```bash
npm install --save-dev alchemy-viz   # or: bun add --dev alchemy-viz
npx alchemy-viz                      # or: bunx --bun alchemy-viz
```

It runs on Node 22.22.3, 24.11.1 or newer, or Bun. Releases are listed on [GitHub](https://github.com/Develomark-Agency/alchemy-viz/releases) and published to [npm](https://www.npmjs.com/package/alchemy-viz).

## This repository

```
packages/alchemy-viz   the library: CLI, server, dashboard, UI kit, built-in Cloudflare and Turso plugins
examples/basic         a test Alchemy project (Worker + KV + D1 + R2 + Queue + Durable Object + Workflow + Secrets Store + email + a custom resource, and opt-in Turso)
scripts/               release and smoke-test scripts
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
- **Local data** (KV, D1, R2, Secrets Store) is read and written through Alchemy's platform proxy, pointed at `.alchemy/local`. That's the same storage `alchemy dev`'s simulators use, so changes show up in running Workers right away.
- **Queues and Workflows** are reached through the same proxy's dev registry, which routes a queue message or a workflow call to the `alchemy dev` process that consumes or runs it.
- **Durable Object and Workflow storage** is read straight from the SQLite files workerd keeps under `.alchemy/local`, with writes refused. Stored values are in V8's serialization format, which alchemy-viz decodes itself.
- **Hyperdrive** has no local proxy: Workers connect straight to its `dev` origin, so the dashboard does too, with Bun's built-in Postgres/MySQL client and the credentials in local state. The password stays on the server.
- **Containers** are found through the Docker CLI, by the labels and image tags `alchemy dev` gives them.
- **Logs** come from `.alchemy/log/*.ndjson`. Each line carries the resource's FQN, so every local resource gets a log tab.
- `alchemy`, `effect` and `@alchemy.run/cloudflare-runtime` are always loaded from **your project**, so their versions match the stack.
- The dashboard is served by Vite running inside the CLI, so plugin views are compiled and hot-reloaded like any Vite app. Its cache lives in `.alchemy/alchemy-viz/` and is safe to delete.
- The API only answers the dashboard itself. Requests with another Host, Origin or `Sec-Fetch-Site` are refused, and POSTs must be JSON. Other web pages you visit can't read or change your local data through it.

Resources that don't run in `alchemy dev` (deployed, or pinned to the cloud) link to their page in the provider's dashboard: an **Open in Cloudflare** button on every Cloudflare resource, and a link card in place of a local view.

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
- Listing `plugins` replaces the defaults (`cloudflare()` and `turso()`), so include the ones you want.
- A resource gets one tab per view that matches its type, in plugin order. Give a view `when: resource => boolean` to show it only where it has something to show (the built-in Durable Objects tab appears only on Workers that host one).
- The config is validated at startup, so a mistake names the field that's wrong.
- CLI flags: `--stage` (or `ALCHEMY_STAGE`), `--port`, `--config`; `alchemy-viz --help` lists them. Set `VIZ_DEBUG=1` to see Vite's own output.

## Writing a view

A view is two files. The server half runs in the alchemy-viz process, with Node APIs and your project's dependencies. Stick to Node APIs (not `Bun.*`) if the dashboard may run on Node. Wrap a handler in `handler(schema, fn)` to validate its input with any Standard Schema library (Zod, Effect Schema, Valibot, ArkType…). The browser then gets the schema's input type, and invalid input comes back as a readable error.

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
| Worker → Durable Objects | Each class's stored objects; an object's key-value entries (decoded), SQL tables, and a read-only SQL console |
| Worker → Sent email | Mail sent through `send_email` bindings, which `alchemy dev` stores instead of delivering: headers, HTML and text bodies, source, attachments |
| Queue | Send JSON or text messages (with a delay, or as a batch) to the running consumer and watch its logs; settings, producers and consumers |
| Workflow | Instances with live step timelines (attempts, sleeps, waits, results); start, pause, resume, restart, terminate, send events |
| Secrets Store / Secret | Secrets with values hidden until revealed; add, change, delete; marks the ones the stack declares |
| Hyperdrive | Connects to the config's `dev` origin (Postgres or MySQL) as Workers do in `alchemy dev`; connection status, table browser and SQL console |
| Container | The Docker containers running it (one per Durable Object instance) with their configuration and output, kept listed for a while after workerd removes them; stop |

Every resource also gets **Details** (attributes, props, bindings, dependencies) and **Logs**.

Local queues keep no backlog (messages go straight to the consumer), so there's nothing to browse; Durable Objects appear once they've written to storage, listed by id. Containers need Docker; the example enables one with `EXAMPLE_CONTAINERS=1 bun run dev`. For Hyperdrive, start the example's seeded Postgres in Docker with `bun run db:up` (`bun run db:down` removes it), then run `EXAMPLE_HYPERDRIVE=1 bun run dev`.

## Built-in Turso views

`alchemy-viz/turso` covers every [`@alchemy.run/turso`](https://alchemy.run/turso) resource. Turso has no local simulator, so these views talk to Turso Cloud. They use the same credentials as the stack: `TURSO_API_TOKEN` (and optionally `TURSO_ORGANIZATION`), or the selected Alchemy profile (`alchemy profile edit --add Turso`). The Platform API token stays in the alchemy-viz process.

| Resource | View |
| --- | --- |
| Database | URL, region, group, applied migrations and this period's usage; table browser and SQL console over the database's own SQL endpoint, with a short-lived token minted for it. A database served by a libSQL server on this machine (`http://127.0.0.1…`, or a local provider) is queried there with no token |
| Group | Locations and their status; every database in the group, linked to the stack's own and marking the ones it doesn't manage |
| Database token / Group token / API token | Access, scope and expiry; the token hidden until revealed; a check that runs `SELECT 1` with it on each database it covers, or validates an API token with Turso |
| Organization settings / member / invite | The organization's settings (marking the ones the stack manages, and any drift), plan usage against its quotas, members and pending invites |

The example declares a group, a database with migrations and a seed file, a database token, a group token, a group-scoped API token and organization settings. They're real Turso resources, so they're opt-in: `EXAMPLE_TURSO=1 TURSO_API_TOKEN=… bun run dev`. Like the other opt-in resources, a later run without `EXAMPLE_TURSO=1` deletes them. Members and invites need a team organization on a paid plan, so the example leaves them out.

## Developing

`bun run viz` in `examples/basic` runs the CLI straight from `packages/alchemy-viz/src` (through the `alchemy-viz-source` export condition), so changes need no build. The published package is `dist/`, built by [tsdown](https://tsdown.dev):

| Command (repo root) | |
| --- | --- |
| `bun run check` | Typecheck, lint, build |
| `bun run build` | Build `packages/alchemy-viz/dist` |
| `bun run smoke` | Pack the package, install it into a copy of the example, and check the dashboard under Node and Bun |

CI runs the checks and the smoke test (Node 22 and 24) on every push and pull request.

## Releasing

```bash
bun release patch   # or minor, major
```

`scripts/release.ts` checks that local `main` matches GitHub, shows the version it will release (`0.1.0 → 0.1.1`), runs the checks, then starts the [Release workflow](.github/workflows/release.yml) and follows it. The workflow bumps the version, runs the checks and the smoke test, commits and tags `vX.Y.Z` on `main`, publishes to npm and creates the GitHub Release with the tarball and generated notes. Nothing is committed or tagged unless every check passes. If publishing fails after tagging, re-run the failed job from the run's page. `--dry-run` shows the version without releasing anything.

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers): no token is stored. The `alchemy-viz` package on npm names this repository and `release.yml` as its trusted publisher.
