/**
 * The package's version, and the next one.
 *
 *   bun scripts/version.ts                     prints the current version
 *   bun scripts/version.ts <major|minor|patch> [--expect <version>]
 *                                              bumps packages/alchemy-viz/package.json
 *                                              and prints the new version
 *
 * `--expect` refuses to bump unless the current version is the one given,
 * so the release workflow bumps the version `bun release` showed you, not
 * one a concurrent release already moved past.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BUMPS = ["major", "minor", "patch"] as const;
export type Bump = typeof BUMPS[number];

export const MANIFEST = join(import.meta.dirname, "..", "packages", "alchemy-viz", "package.json");

export function isBump(value: string | undefined): value is Bump {
  return BUMPS.includes(value as Bump);
}

export function readVersion(): string {
  return JSON.parse(readFileSync(MANIFEST, "utf8")).version;
}

export function nextVersion(current: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if(!match) throw new Error(`Can't bump '${current}': expected a plain major.minor.patch version.`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if(bump === "major") return `${major + 1}.0.0`;
  if(bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Rewrites only the version line, so the rest of the file keeps its formatting. */
export function writeVersion(version: string) {
  const text = readFileSync(MANIFEST, "utf8");
  const updated = text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  if(updated === text) throw new Error(`No "version" field in ${MANIFEST}.`);
  writeFileSync(MANIFEST, updated);
}

if(import.meta.main) {
  const [bump] = process.argv.slice(2);
  const expectAt = process.argv.indexOf("--expect");
  const expected = expectAt === -1 ? undefined : process.argv[expectAt + 1];
  const current = readVersion();
  if(bump === undefined) {
    console.log(current);
  } else if(!isBump(bump)) {
    console.error(`Usage: bun scripts/version.ts [${BUMPS.join("|")}] [--expect <version>]`);
    process.exit(1);
  } else if(expected && expected !== current) {
    console.error(`The version is ${current}, not ${expected}. Another release may have run since; start again.`);
    process.exit(1);
  } else {
    const next = nextVersion(current, bump);
    writeVersion(next);
    console.log(next);
  }
}
