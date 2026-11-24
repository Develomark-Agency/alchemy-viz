import { Eye, EyeOff, Play } from "lucide-react";
import { type ReactNode, useState } from "react";
import { defineView, ResourceLink } from "../../../client/index.tsx";
import { Badge, Button, CopyButton, ErrorBanner, formatTime, IconButton, KeyValueList, Loading, Panel, Status } from "../../../ui/index.ts";
import type server from "./server.ts";

const DAY = 86_400_000;

/** "in 6 days", "in 3 hours", "2 days ago". */
function relative(at: number) {
  const diff = at - Date.now();
  const abs = Math.abs(diff);
  const [n, unit] = abs >= DAY ? [Math.round(abs / DAY), "day"] : abs >= 3_600_000 ? [Math.round(abs / 3_600_000), "hour"] : [Math.max(1, Math.round(abs / 60_000)), "minute"];
  const text = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function Expiry({ at }: { at: number | undefined }) {
  if(at === undefined) return <span>Never</span>;
  const tone = at < Date.now() ? "danger" : at - Date.now() < DAY ? "warn" : "ok";
  return (
    <span className="flex flex-wrap items-center gap-2" title={formatTime(at)}>
      <Status tone={tone}>{at < Date.now() ? `Expired ${relative(at)}` : `Expires ${relative(at)}`}</Status>
      <span className="text-xs text-fg-subtle">{formatTime(at)}</span>
    </span>
  );
}

const ACCESS: Record<string, string> = { "full-access": "Full access", "read-only": "Read only" };

/** What a token grants, when it expires, the token itself on request, and a live check that it still works. */
export default defineView<typeof server>(({ api }) => {
  const info = api.info.useQuery(undefined, { retry: false });
  const revealed = api.reveal.useMutation();
  const test = api.test.useMutation();
  const [shown, setShown] = useState(false);
  const t = info.data;

  if(info.error) return <ErrorBanner error={info.error} />;
  if(!t) return <Loading />;

  const token = shown ? revealed.data?.token : undefined;
  const items: Array<[ReactNode, ReactNode]> = [];
  if(t.kind === "api") {
    items.push(["Name", <span key="n" className="font-mono text-xs">{t.name}</span>]);
    items.push(["Scope", t.scope === "group"
      ? <span key="s" className="flex flex-wrap items-center gap-1.5">Group {t.targetFqn ? <ResourceLink fqn={t.targetFqn} className="font-mono text-xs hover:underline" /> : <span className="font-mono text-xs">{t.target}</span>}</span>
      : <span key="s">Organization <span className="font-mono text-xs">{t.organization}</span></span>]);
    if(t.scopes.length) items.push(["Permissions", <span key="p" className="flex flex-wrap gap-1.5">{t.scopes.map(s => <Badge key={s}>{s}</Badge>)}</span>]);
    if(t.listed !== undefined) items.push(["In Turso", t.listed ? <Status key="l" tone="ok">Exists</Status> : <Status key="l" tone="danger">Revoked or deleted</Status>]);
  } else {
    items.push(["Access", t.authorization && <Badge key="a" tone={t.authorization === "read-only" ? "info" : "accent"}>{ACCESS[t.authorization] ?? t.authorization}</Badge>]);
    items.push([t.kind === "database" ? "Database" : "Group", t.targetFqn
      ? <ResourceLink key="d" fqn={t.targetFqn} className="font-mono text-xs hover:underline" />
      : <span key="d" className="font-mono text-xs">{t.target}</span>]);
    if(t.kind === "group") items.push(["Covers", <span key="c" className="text-xs text-fg-muted">Every database in the group, including ones created later</span>]);
    items.push(["Expires", <Expiry key="e" at={t.expiresAt} />]);
    if(t.issuedAt) items.push(["Issued", <span key="i" className="text-xs">{formatTime(t.issuedAt)}</span>]);
  }

  async function toggle() {
    if(shown) return setShown(false);
    if(!revealed.data) await revealed.mutateAsync(undefined);
    setShown(true);
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Panel title="Token">
        <div className="flex flex-col gap-4">
          <KeyValueList items={items} />
          {t.local
            ? <p className="text-xs text-fg-subtle">No token: it belongs to a local database, which checks none. A deploy mints a real one.</p>
            : (
              <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">
                  {token ?? <span className="tracking-widest text-fg-subtle">••••••••••••••••••••••••</span>}
                </code>
                <IconButton label={shown ? "Hide" : "Reveal"} onClick={toggle} disabled={!t.hasToken || revealed.isPending}>
                  {shown ? <EyeOff /> : <Eye />}
                </IconButton>
                {token && <CopyButton text={token} label="Copy token" />}
              </div>
            )}
          <ErrorBanner error={revealed.error} />
        </div>
      </Panel>
      <Panel
        title="Check"
        actions={(
          <Button size="sm" onClick={() => test.mutate(undefined)} disabled={!t.hasToken || test.isPending}>
            <Play />
            {test.data ? "Run again" : "Run check"}
          </Button>
        )}
      >
        {test.error
          ? <ErrorBanner error={test.error} />
          : test.isPending
            ? <Loading label="Checking…" />
            : test.data
              ? test.data.checks.length === 0
                ? <p className="text-[13px] text-fg-subtle">The group has no databases to check against.</p>
                : (
                  <ul className="flex flex-col gap-2">
                    {test.data.checks.map(c => (
                      <li key={c.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                        <Status tone={c.ok ? "ok" : "danger"}>{c.ok ? "Works" : "Failed"}</Status>
                        <span className="font-mono text-xs">{c.label}</span>
                        {c.ok
                          ? <span className="text-xs text-fg-subtle tabular-nums">{"detail" in c && c.detail ? c.detail : `${c.latencyMs} ms`}</span>
                          : <span className="text-xs text-danger">{c.error}</span>}
                      </li>
                    ))}
                  </ul>
                )
              : (
                <p className="text-[13px] text-fg-subtle">
                  {t.kind === "api" ? "Validates the token with the Turso Platform API." : t.kind === "database" ? "Runs SELECT 1 on the database with this token." : "Runs SELECT 1 on every database in the group with this token."}
                </p>
              )}
      </Panel>
    </div>
  );
});
