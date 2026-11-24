/**
 * A one-off custom resource used only by this project: a set of feature
 * flags persisted to a JSON file. It exists to show how a project-specific
 * resource gets its own page in alchemy-viz (see ../viz/feature-flags).
 */
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface FeatureFlagsProps {
  /** Initial flag values. Flags toggled later in the dashboard are kept. */
  flags: Record<string, boolean>
}

export interface FeatureFlagsAttributes {
  /** Absolute path of the JSON file holding the flags. */
  file: string,
  flagCount: number
}

export type FeatureFlags = Resource<"Acme.FeatureFlags", FeatureFlagsProps, FeatureFlagsAttributes>;

export const FeatureFlags = Resource<FeatureFlags>("Acme.FeatureFlags");

export function flagsFile(id: string) {
  return resolve(".alchemy", "acme", `flags-${id}.json`);
}

export function FeatureFlagsProvider() {
  return Provider.succeed(
    FeatureFlags,
    FeatureFlags.Provider.of({
      reconcile: ({ id, news }) => Effect.promise(async () => {
        const file = flagsFile(id);
        let current: Record<string, boolean> = {};
        try {
          current = JSON.parse(await readFile(file, "utf8"));
        } catch {}
        const merged = { ...news.flags, ...current };
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(merged, null, 2));
        return { file, flagCount: Object.keys(merged).length };
      }),
      delete: ({ output }) => Effect.promise(() => rm(output.file, { force: true })),
      list: () => Effect.succeed([])
    })
  );
}
