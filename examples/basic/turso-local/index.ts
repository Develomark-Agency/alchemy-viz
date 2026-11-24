/**
 * EXPERIMENT: local Turso databases for `alchemy dev`, as a local provider
 * for the official `Turso.Database` type rather than a resource of its own.
 * Opt in with EXAMPLE_TURSO_LOCAL=1. Everything it touches outside this
 * folder came in one commit ("turso-local experiment"), so reverting that
 * commit removes it: the `turso-local` lines and the `Alchemy.remote()` in
 * alchemy.run.ts, `turso-local/**` in tsconfig.json, and the
 * `@alchemy.run/sql` dependency. Its data lives in .alchemy/turso-local/.
 *
 * `providers()` is `Turso.providers()` with Database and DatabaseToken
 * registered twice over (`ProviderLayer.dual`): their cloud providers for
 * `alchemy deploy` and for resources wrapped in `Alchemy.remote()`, and the
 * local ones in ./database.ts everywhere else under `alchemy dev`. A
 * provider registered directly takes priority over the one inside
 * `Turso.providers()`'s collection.
 */
import * as Turso from "@alchemy.run/turso";
import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { LocalDatabaseProvider, LocalDatabaseTokenProvider } from "./database.ts";

export function providers() {
  return Layer.mergeAll(
    ProviderLayer.dual(Turso.Database, {
      live: () => Turso.DatabaseProvider(),
      local: () => LocalDatabaseProvider().pipe(Layer.provide(NodeServices.layer))
    }),
    ProviderLayer.dual(Turso.DatabaseToken, {
      live: () => Turso.DatabaseTokenProvider(),
      local: () => LocalDatabaseTokenProvider()
    })
  ).pipe(
    // The cloud variants need Turso's credentials and HTTP client, which Turso.providers() also exports.
    Layer.provideMerge(Turso.providers())
  );
}
