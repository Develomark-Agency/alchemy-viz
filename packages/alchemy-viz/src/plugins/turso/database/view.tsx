import { Database } from "lucide-react";
import type { ReactNode } from "react";
import { defineView, ResourceLink } from "../../../client/index.tsx";
import { Badge, CopyButton, ErrorBanner, formatBytes, KeyValueList, Loading, Panel, Status } from "../../../ui/index.ts";
import d1 from "../../cloudflare/d1/view.tsx";
import type server from "./server.ts";

/**
 * Where the database lives and how it's doing, then the D1 view's table
 * browser and SQL console, which this view's server answers in the same
 * shapes.
 */
export default defineView<typeof server>(({ api, resource, stack }) => {
  const overview = api.overview.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const o = overview.data;
  const Browser = d1.component;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={(
          <span className="flex items-center gap-2">
            <Database className="size-3.5 text-fg-subtle" />
            {o?.local ? "Local database" : "Turso database"}
            {o && (o.ok ? <Status tone="ok" className="font-normal">Connected</Status> : <Status tone="danger" className="font-normal">Unreachable</Status>)}
          </span>
        )}
        actions={o?.latencyMs !== undefined && <span className="text-xs tabular-nums text-fg-subtle">{o.latencyMs} ms</span>}
      >
        {overview.error
          ? <ErrorBanner error={overview.error} />
          : !o
            ? <Loading />
            : (
              <div className="flex flex-col gap-3">
                <KeyValueList
                  items={[
                    ["URL", o.url && (
                      <span key="u" className="flex min-w-0 items-center gap-1">
                        <span className="truncate font-mono text-xs">{o.url}</span>
                        <CopyButton text={o.url} label="Copy URL" />
                      </span>
                    )],
                    ["Region", o.regions.length > 0 && (
                      <span key="r" className="flex flex-wrap gap-1.5">
                        {o.regions.map(region => <Badge key={region} tone={region === o.primaryRegion && o.regions.length > 1 ? "accent" : "neutral"}>{region}</Badge>)}
                      </span>
                    )],
                    ["Group", o.group && (o.groupFqn
                      ? <ResourceLink key="g" fqn={o.groupFqn} className="font-mono text-xs hover:underline" />
                      : <span key="g" className="font-mono text-xs">{o.group}</span>)],
                    ["SQLite", o.version && <span key="v" className="font-mono text-xs">{o.version}</span>],
                    ["Migrations", o.migrations.applied.length > 0
                      ? (
                        <span key="m" className="flex flex-wrap items-center gap-1.5">
                          {o.migrations.applied.map(m => <Badge key={m}>{m}</Badge>)}
                          {o.migrations.dir && <span className="font-mono text-xs text-fg-subtle">{o.migrations.dir}</span>}
                        </span>
                      )
                      : "None"],
                    ...o.usage
                      ? [["This period", (
                        <span key="use" className="text-xs tabular-nums">
                          {o.usage.rowsRead.toLocaleString()} rows read, {o.usage.rowsWritten.toLocaleString()} written, {formatBytes(o.usage.storageBytes)} stored
                        </span>
                      )] as [string, ReactNode]]
                      : [],
                    ...Object.values(o.flags).some(Boolean)
                      ? [["Settings", (
                        <span key="f" className="flex flex-wrap gap-1.5">
                          {o.flags.blockReads && <Badge tone="warn">Reads blocked</Badge>}
                          {o.flags.blockWrites && <Badge tone="warn">Writes blocked</Badge>}
                          {o.flags.deleteProtection && <Badge tone="info">Delete protection</Badge>}
                        </span>
                      )] as [string, ReactNode]]
                      : [],
                    ...o.tokens.length
                      ? [["Tokens", (
                        <span key="t" className="flex flex-wrap gap-2">
                          {o.tokens.map(fqn => <ResourceLink key={fqn} fqn={fqn} className="font-mono text-xs hover:underline" />)}
                        </span>
                      )] as [string, ReactNode]]
                      : []
                  ]}
                />
                {o.error && <ErrorBanner error={`Can't reach the database: ${o.error}`} />}
                <p className="text-xs text-fg-subtle">
                  {o.local
                    ? "A libSQL server on this machine. Changes made here go to its local data files."
                    : "This is the database in Turso Cloud, reached with a short-lived token from your Turso credentials. Changes made here are real changes to it."}
                </p>
              </div>
            )}
      </Panel>
      {o?.ok && <Browser api={api as never} resource={{ ...resource, attr: { ...resource.attr, databaseName: o.name } }} stack={stack} />}
    </div>
  );
});
