import { defineServer, type HandlerContext, requireResource } from "../../../server/define.ts";
import type { ResourceInfo } from "../../../types.ts";
import { decodeJwt, execute, orgOf, platform, reveal } from "../platform.ts";

/**
 * Turso's three kinds of token: a `DatabaseToken` runs SQL on one database,
 * a `GroupToken` on every database in a group, and an `ApiToken` calls the
 * Platform API. The token itself stays on the server until it is revealed
 * on purpose.
 */

type Kind = "database" | "group" | "api";

function kindOf(r: ResourceInfo): Kind {
  return r.type === "Turso.DatabaseToken" ? "database" : r.type === "Turso.GroupToken" ? "group" : "api";
}

async function tokenOf(ctx: HandlerContext, r: ResourceInfo) {
  const token = await reveal(ctx, r.attr?.token);
  // A local provider's token is empty: a local libSQL server checks none.
  if(token === undefined || (token === "" && r.mode !== "local")) throw new Error("This token isn't in state yet. It appears once the token is created.");
  return token;
}

function seconds(value: unknown) {
  return typeof value === "number" ? value * 1000 : undefined;
}

/** The HTTP endpoint of a database by name: from the stack when it's there, else the Platform API. */
async function databaseUrl(ctx: HandlerContext, org: string, name: string) {
  const own = ctx.stack.resources.find(x => x.type === "Turso.Database" && x.attr?.name === name);
  // A local database's URL is http://127.0.0.1:<port>, not https://<hostname>.
  if(typeof own?.attr?.httpUrl === "string") return own.attr.httpUrl;
  const hostname = (own?.attr?.hostname as string | undefined)
    ?? (await platform<{ database: { Hostname: string } }>(ctx, `/organizations/${encodeURIComponent(org)}/databases/${encodeURIComponent(name)}`)).database.Hostname;
  return `https://${hostname}`;
}

async function tryDatabase(url: string, token: string) {
  const started = performance.now();
  try {
    await execute({ url, token }, "SELECT 1");
    return { ok: true as const, latencyMs: Math.round((performance.now() - started) * 10) / 10 };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export default defineServer({
  info: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const a = r.attr ?? {};
    const kind = kindOf(r);
    const token = await reveal(ctx, a.token);
    const claims = token && kind !== "api" ? decodeJwt(token) : undefined;
    const target = kind === "database" ? a.database as string | undefined : a.group as string | undefined;
    const targetType = kind === "database" ? "Turso.Database" : "Turso.Group";
    const targetFqn = target ? ctx.stack.resources.find(x => x.type === targetType && x.attr?.name === target)?.fqn : undefined;

    // An API token can be revoked outside the stack; Turso still lists the ones that exist.
    let listed: boolean | undefined;
    if(kind === "api" && typeof a.id === "string") {
      const { tokens } = await platform<{ tokens: Array<{ id: string }> }>(ctx, "/auth/api-tokens").catch(() => ({ tokens: undefined as Array<{ id: string }> | undefined }));
      listed = tokens ? tokens.some(t => t.id === a.id) : undefined;
    }

    return {
      kind,
      hasToken: token !== undefined && (token !== "" || r.mode === "local"),
      local: r.mode === "local",
      organization: await orgOf(ctx, r),
      name: a.name as string | undefined,
      id: a.id as string | undefined,
      authorization: a.authorization as string | undefined,
      scopes: (a.scopes as string[] | undefined) ?? [],
      target,
      targetFqn,
      // A group-scoped API token is restricted to its group; an organization token isn't.
      scope: kind === "api" ? (a.group ? "group" : "organization") : kind,
      expiresAt: (a.expiresAt as number | undefined) ?? seconds(claims?.exp),
      issuedAt: seconds(claims?.iat),
      listed
    };
  },

  /** The token itself. Only sent when asked for. */
  reveal: async (_: undefined, ctx) => ({ token: await tokenOf(ctx, requireResource(ctx)) }),

  /**
   * Uses the token the way an app would: `SELECT 1` on its database (or on
   * every database in its group), or the Platform API's validate endpoint
   * for an API token.
   */
  test: async (_: undefined, ctx) => {
    const r = requireResource(ctx);
    const token = await tokenOf(ctx, r);
    const kind = kindOf(r);
    const org = await orgOf(ctx, r);

    if(kind === "api") {
      const started = performance.now();
      try {
        const { exp } = await platform<{ exp: number }>(ctx, "/auth/validate", { token });
        const latencyMs = Math.round((performance.now() - started) * 10) / 10;
        const expires = exp && exp > 0 ? exp * 1000 : undefined;
        return { checks: [{ label: "Platform API", ok: true as const, latencyMs, detail: expires ? `Valid until ${new Date(expires).toISOString()}` : "Valid, never expires" }] };
      } catch (e) {
        return { checks: [{ label: "Platform API", ok: false as const, error: e instanceof Error ? e.message : String(e) }] };
      }
    }

    const names = kind === "database"
      ? [r.attr?.database as string]
      : (await platform<{ databases: Array<{ Name: string }> }>(ctx, `/organizations/${encodeURIComponent(org)}/databases?group=${encodeURIComponent(r.attr?.group as string)}`)).databases.map(d => d.Name);
    const checks = await Promise.all(names.map(async name => {
      // Name databases the way the stack does, when it has them.
      const label = ctx.stack.resources.find(x => x.type === "Turso.Database" && x.attr?.name === name)?.logicalId ?? name;
      const url = await databaseUrl(ctx, org, name).catch(() => undefined);
      if(!url) return { label, ok: false as const, error: "Database not found." };
      return { label, ...await tryDatabase(url, token) };
    }));
    return { checks };
  }
});
