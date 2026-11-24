import { Database } from "lucide-react";
import { defineView, ResourceLink } from "../../../client/index.tsx";
import { ErrorBanner, KeyValueList, Loading, Panel, Status } from "../../../ui/index.ts";
import d1 from "../d1/view.tsx";
import type server from "./server.ts";

/**
 * The connection, then the D1 view's table browser and SQL console, which
 * this view's server answers in the same shapes.
 */
export default defineView<typeof server>(({ api, resource, stack }) => {
  const connection = api.connection.useQuery(undefined, { retry: false, refetchInterval: 15_000 });
  const c = connection.data;
  const Browser = d1.component;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={(
          <span className="flex items-center gap-2">
            <Database className="size-3.5 text-fg-subtle" />
            Local database
            {c && (c.ok ? <Status tone="ok" className="font-normal">Connected</Status> : <Status tone="danger" className="font-normal">Unreachable</Status>)}
          </span>
        )}
        actions={c?.latencyMs !== undefined && <span className="text-xs tabular-nums text-fg-subtle">{c.latencyMs} ms</span>}
      >
        {connection.error
          ? <ErrorBanner error={connection.error} />
          : !c
            ? <Loading />
            : (
              <div className="flex flex-col gap-3">
                <KeyValueList
                  items={[
                    ["Origin", <span key="o" className="font-mono text-xs">{c.scheme}://{c.user}@{c.host}:{c.port}/{c.database}{c.sslmode ? ` (sslmode ${c.sslmode})` : ""}</span>],
                    ["Server", <span key="v" className="text-xs break-words">{c.version ?? "—"}</span>],
                    ["Bound to", c.workers.length
                      ? <span key="w" className="flex flex-wrap gap-2">{c.workers.map(fqn => <ResourceLink key={fqn} fqn={fqn} className="font-mono text-xs hover:underline" />)}</span>
                      : "No Worker"]
                  ]}
                />
                {c.error && <ErrorBanner error={`Can't reach the dev origin: ${c.error}`} />}
                <p className="text-xs text-fg-subtle">
                  In <code className="font-mono">alchemy dev</code> Workers connect straight to this <code className="font-mono">dev</code> origin: no pooling or query caching. Changes made here are real changes to that database.
                </p>
              </div>
            )}
      </Panel>
      {c?.ok && <Browser api={api as never} resource={{ ...resource, attr: { ...resource.attr, databaseName: c.database } }} stack={stack} />}
    </div>
  );
});
