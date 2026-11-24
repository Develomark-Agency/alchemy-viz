/**
 * Releases alchemy-viz:
 *
 *   bun release <major|minor|patch> [--dry-run] [--skip-checks]
 *
 * Shows the version it will release, runs the checks locally so a broken
 * build fails here rather than in CI, then starts the Release workflow on
 * GitHub and follows it. The workflow does the rest: bumps the version,
 * checks, builds and smoke-tests it, commits and tags the release on main,
 * publishes to npm and creates the GitHub Release. Nothing is committed or
 * tagged unless every check passes. When it finishes, local main is pulled
 * up to the release commit.
 *
 * Needs the GitHub CLI (`gh`), signed in with access to the repository.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { BUMPS, isBump, nextVersion, readVersion } from "./version.ts";

const WORKFLOW = "release.yml";
const BRANCH = "main";

const args = process.argv.slice(2);
const bump = args.find(a => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skipChecks = args.includes("--skip-checks");

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function capture(cmd: string, cmdArgs: string[]) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function run(cmd: string, cmdArgs: string[]) {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  return result.status === 0;
}

function step(message: string) {
  console.log(`\n→ ${message}`);
}

if(!isBump(bump)) {
  console.error(`Usage: bun release <${BUMPS.join("|")}> [--dry-run] [--skip-checks]`);
  process.exit(1);
}

// The workflow releases what's on GitHub's main, so that has to be exactly
// what's here: no uncommitted changes, nothing unpushed, nothing unpulled.
try {
  capture("gh", ["auth", "status"]);
} catch {
  fail("The GitHub CLI isn't installed or isn't signed in. Install `gh` and run `gh auth login`.");
}
const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if(branch !== BRANCH) fail(`Releases are made from ${BRANCH}; this is ${branch}.`);
if(capture("git", ["status", "--porcelain", "--untracked-files=no"])) fail("There are uncommitted changes. Commit or stash them first.");
capture("git", ["fetch", "--quiet", "--tags", "origin", BRANCH]);
const local = capture("git", ["rev-parse", "HEAD"]);
const remote = capture("git", ["rev-parse", `origin/${BRANCH}`]);
if(local !== remote) {
  const ahead = capture("git", ["rev-list", "--count", `origin/${BRANCH}..HEAD`]);
  const behind = capture("git", ["rev-list", "--count", `HEAD..origin/${BRANCH}`]);
  fail(`Local ${BRANCH} doesn't match origin (${ahead} ahead, ${behind} behind). Push or pull first.`);
}

const current = readVersion();
const next = nextVersion(current, bump);
if(capture("git", ["tag", "--list", `v${next}`])) fail(`The tag v${next} already exists.`);
console.log(`alchemy-viz ${current} → ${next} (${bump})`);

if(dryRun) {
  console.log(`\nDry run: would run the checks, then start ${WORKFLOW} with bump=${bump} on ${BRANCH}.`);
  process.exit(0);
}

if(!skipChecks) {
  step("Checking (typecheck, lint, build)");
  if(!run("bun", ["run", "check"])) fail("The checks failed. Nothing was released.");
}

step(`Starting the ${WORKFLOW} workflow`);
const startedAt = new Date();
if(!run("gh", ["workflow", "run", WORKFLOW, "--ref", BRANCH, "-f", `bump=${bump}`, "-f", `expect=${current}`])) {
  fail("Couldn't start the workflow.");
}

// `gh workflow run` doesn't say which run it started: find the newest
// dispatch of this workflow created since.
let runId: string | undefined;
for(let attempt = 0; attempt < 30 && !runId; attempt++) {
  await new Promise(ok => setTimeout(ok, 2_000));
  const runs = JSON.parse(capture("gh", ["run", "list", "--workflow", WORKFLOW, "--event", "workflow_dispatch", "--limit", "5", "--json", "databaseId,createdAt"])) as Array<{ databaseId: number, createdAt: string }>;
  runId = runs.find(r => new Date(r.createdAt).getTime() >= startedAt.getTime() - 5_000)?.databaseId.toString();
}
if(!runId) fail(`Started the workflow but couldn't find its run. Follow it with \`gh run list --workflow ${WORKFLOW}\`.`);

step(`Following run ${runId}`);
const succeeded = run("gh", ["run", "watch", runId, "--exit-status", "--interval", "5"]);
if(!succeeded) {
  const url = capture("gh", ["run", "view", runId, "--json", "url", "--jq", ".url"]);
  fail(`The release failed: ${url}\nIf it failed after tagging (publishing to npm or creating the GitHub Release), re-run the failed jobs there; they pick up the existing tag.`);
}

step(`Pulling the release commit into ${BRANCH}`);
run("git", ["pull", "--ff-only", "--tags", "origin", BRANCH]);

const releaseUrl = capture("gh", ["release", "view", `v${next}`, "--json", "url", "--jq", ".url"]);
console.log(`\n✓ Released alchemy-viz ${next}`);
console.log(`  npm:    https://www.npmjs.com/package/alchemy-viz/v/${next}`);
console.log(`  GitHub: ${releaseUrl}`);
