/**
 * Reads a stack's resources from its configured state store.
 *
 * Uses Alchemy's own `Alchemist.State.store({ type: "configured" })`: it
 * imports the stack module to find the store but never runs the stack
 * program or touches providers, so it is cheap and safe to call while
 * `alchemy dev` is running. Works with any state store the stack
 * configures (local files, Cloudflare, ...).
 */
import { homedir } from "node:os";
import type { ResourceInfo, StackInfo } from "../types.ts";
import { makeImportFromProject } from "./project.ts";

interface PersistedRow {
  status?: string,
  fqn: string,
  logicalId?: string,
  resourceType?: string,
  props?: unknown,
  attr?: unknown,
  bindings?: Array<{ sid: string, data: unknown }>,
  downstream?: string[],
  providerMode?: "local" | "live"
}

export function makeStackReader(root: string, entrypoint: string) {
  const importFromProject = makeImportFromProject(root);
  let modules: Promise<{ Alchemist: any, Effect: any }> | undefined;
  function load() {
    return (modules ??= Promise.all([
      importFromProject("alchemy/Alchemist"),
      importFromProject("effect/Effect")
    ]).then(([Alchemist, Effect]) => ({ Alchemist, Effect })));
  }

  return async (stage: string): Promise<StackInfo> => {
    const { Alchemist, Effect } = await load();
    const program = Effect.gen(function* () {
      const stack = yield* Alchemist.importStack(entrypoint);
      const store = yield* Alchemist.State.store({ type: "configured", entrypoint, stage });
      const name: string = stack.stackName;
      const stages: string[] = yield* store.listStages(name);
      const fqns: string[] = yield* store.list({ stack: name, stage });
      const rows: Array<PersistedRow | undefined> = yield* Effect.forEach(fqns, (fqn: string) => store.get({ stack: name, stage, fqn })
      );
      const output = yield* store.getOutput({ stack: name, stage });
      return { name, stages, rows, output };
    });
    const { name, stages, rows, output } = await Effect.runPromise(
      program.pipe(Effect.provide(Alchemist.layer()), Effect.scoped)
    );

    const resources: ResourceInfo[] = rows
      .filter((row: PersistedRow | undefined): row is PersistedRow => !!row?.resourceType)
      .map((row: PersistedRow) => ({
        fqn: row.fqn,
        logicalId: row.logicalId ?? row.fqn,
        type: row.resourceType!,
        status: row.status ?? "unknown",
        mode: row.providerMode,
        props: row.props ?? {},
        attr: row.attr ?? {},
        bindings: row.bindings ?? [],
        downstream: row.downstream ?? [],
        upstream: []
      }));
    const byFqn = new Map(resources.map(r => [r.fqn, r]));
    for(const r of resources) {
      for(const d of r.downstream) byFqn.get(d)?.upstream.push(r.fqn);
    }
    resources.sort((a, b) => a.fqn.localeCompare(b.fqn));

    return {
      name,
      stage,
      stages: stages.includes(stage) ? stages : [stage, ...stages],
      root,
      home: homedir(),
      output: output ?? null,
      resources
    };
  };
}
