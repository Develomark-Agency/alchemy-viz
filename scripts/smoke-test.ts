/**
 * Installs the packed package into a copy of examples/basic, the way a user
 * would, and runs the dashboard under Node and Bun:
 *
 *   bun scripts/smoke-test.ts [--keep]
 *
 * Each run checks that the CLI starts and reads the stack (the project's
 * TypeScript loads), that a project server module answers, that views get
 * `alchemy-viz/*` as the same files the shell uses (not a pre-bundled
 * copy), and that the stylesheet compiles. `--keep` leaves the temporary
 * project behind for poking at.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const pkgDir = join(repo, "packages", "alchemy-viz");
const keep = process.argv.includes("--keep");

const work = realpathSync(mkdtempSync(join(tmpdir(), "alchemy-viz-smoke-")));
const app = join(work, "app");

function run(cmd: string, args: string[], cwd: string) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function check(ok: unknown, message: string): asserts ok {
  if(!ok) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

async function text(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
}

/** Starts the CLI and resolves with its URL once it prints one. */
function start(command: string[], port: number) {
  const child = spawn(command[0]!, [...command.slice(1), "--port", String(port)], { cwd: app, env: { ...process.env, NO_COLOR: "1" } });
  let output = "";
  const url = new Promise<string>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`No URL after 60s. Output:\n${output}`)), 60_000);
    function onData(chunk: Buffer) {
      output += chunk;
      const match = /➜ (http:\/\/localhost:\d+)/.exec(output);
      if(match) {
        clearTimeout(timer);
        ok(match[1]!);
      }
    }
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", code => {
      clearTimeout(timer);
      fail(new Error(`Exited with ${code} before printing a URL. Output:\n${output}`));
    });
  });
  return { child, url, output: () => output };
}

function stop(child: ChildProcess) {
  return new Promise<void>(ok => {
    if(child.exitCode !== null) return ok();
    child.once("exit", () => ok());
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  });
}

/** The URL a module imports `alchemy-viz/ui` from, as Vite rewrote it. */
function uiImport(code: string) {
  return /from "([^"]+\/ui\/index\.mjs[^"]*)"/.exec(code)?.[1];
}

async function smoke(label: string, command: string[], port: number) {
  console.log(`\n${label}: ${command.join(" ")}`);
  const proc = start(command, port);
  try {
    const url = await proc.url;
    check(!/Couldn't read the stack/.test(proc.output()), "reads the stack");

    const page = await text(url);
    check(page.status === 200 && page.body.includes("id=\"root\""), "serves the shell");

    const stack = JSON.parse((await text(`${url}/__viz/api/stack`)).body);
    check(stack.stack?.name === "VizExample", "answers the stack API");

    // The project's own server module: no Worker runs here, so the handler
    // throws its own error, which proves the module loaded and ran.
    const rpc = await text(`${url}/__viz/api/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: { page: "acme:page:0" }, handler: "send", input: { count: 1 } })
    });
    check(rpc.body.includes("No local Worker URL"), "runs a project server module");

    // A project view imports `alchemy-viz/ui` by name and the shell imports
    // it by path. Both must get the same URL, or the browser loads two
    // instances (two toast stores, two sets of contexts).
    const dist = realpathSync(join(app, "node_modules", "alchemy-viz", "dist"));
    const fromView = uiImport((await text(`${url}/@fs${app}/viz/traffic/page.tsx`)).body);
    const fromShell = uiImport((await text(`${url}/@fs${dist}/client/app/shell.mjs`)).body);
    check(fromView?.includes("/node_modules/alchemy-viz/dist/") && fromView === fromShell, "views and the shell share one copy of alchemy-viz/ui");

    const kv = await text(`${url}/@fs${dist}/plugins/cloudflare/kv/view.mjs`);
    check(kv.status === 200, "serves a built-in plugin view");

    const css = await text(`${url}/@fs${dist}/client/app/app.css`);
    check(css.status === 200 && css.body.includes(".flex"), "compiles the stylesheet with Tailwind");
  } catch (error) {
    console.error(proc.output());
    throw error;
  } finally {
    await stop(proc.child);
  }
}

try {
  run("npm", ["pack", "--pack-destination", work], pkgDir);
  const tarball = join(work, readdirSync(work).find(f => f.endsWith(".tgz"))!);

  cpSync(join(repo, "examples", "basic"), app, {
    recursive: true,
    filter: src => !/[\\/](node_modules|\.alchemy)([\\/]|$)/.test(src.slice(repo.length))
  });
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  manifest.devDependencies["alchemy-viz"] = `file:${tarball}`;
  // The installed bin, not the monorepo's source.
  manifest.scripts.viz = "alchemy-viz";
  writeFileSync(join(app, "package.json"), JSON.stringify(manifest, null, 2));
  const tsconfig = readFileSync(join(app, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*\n\s*"customConditions".*\n/m, "");
  writeFileSync(join(app, "tsconfig.json"), tsconfig);
  run("bun", ["install"], app);

  const cli = join(app, "node_modules", "alchemy-viz", "dist", "cli.mjs");
  await smoke("Node", ["node", cli], 4790);
  await smoke("Bun", ["bun", cli], 4791);
  console.log("\nSmoke test passed.");
} finally {
  if(keep) console.log(`\nKept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
