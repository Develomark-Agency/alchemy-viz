/**
 * Starts and stops `alchemy dev | deploy | destroy` for the dashboard, and
 * reports what is running.
 *
 * The dashboard runs one command of its own at a time. It also notices runs
 * started in a terminal: every run writes `.alchemy/log/<time>-pid<pid>.ndjson`,
 * so a live pid whose command line is an Alchemy run is a run in progress.
 * That keeps a second process from fighting a terminal's over the stage's
 * state lock.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { RUN_COMMANDS, type RunCommand, type RunInfo, type RunResult, type RunStatus, STAGE_PATTERN } from "../run.ts";

const exec = promisify(execFile);

const TAIL_LINES = 200;
const LOG_FILES = 8;
/** How long a run gets to wind down after the stop signal before it's killed. */
const KILL_AFTER_MS = 10_000;

/** The request itself is wrong (400). */
export class RunInputError extends Error {}

/** The request is fine but something else is running (409). */
export class RunConflict extends Error {}

function safeRealpath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The signal Ctrl-C sends, so `dev` can shut its simulators down; then a hard kill if it hangs. */
function signalThenKill(pid: number) {
  try {
    process.kill(pid, "SIGINT");
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }, KILL_AFTER_MS).unref();
}

interface ActiveRun {
  info: RunInfo,
  child: ChildProcess,
  stopped: boolean,
  tail: string[],
  killTimer?: ReturnType<typeof setTimeout>,
  done: Promise<void>
}

export interface Runner {
  status(): Promise<RunStatus>,
  start(request: { command: unknown, stage: unknown, confirm?: unknown }): Promise<void>,
  /** Stops the dashboard's own run, or, given a pid, any run listed in `status()`. */
  stop(pid?: unknown): Promise<void>,
  /** Stops the dashboard's own run, if any, and waits for it to end. */
  close(): Promise<void>
}

export function makeRunner(options: {
  root: string,
  entrypoint: string,
  /** The stage a run without `--stage` uses. */
  defaultStage: string,
  /** Called after a run the dashboard started has ended. */
  onExit?: () => void
}): Runner {
  const { root, entrypoint, defaultStage } = options;
  let current: ActiveRun | undefined;
  let last: RunResult | undefined;

  function alchemyBin(): [string, string[]] {
    const local = join(root, "node_modules", ".bin", "alchemy");
    return existsSync(local) ? [local, []] : ["bunx", ["alchemy"]];
  }

  function collect(run: ActiveRun, chunk: Buffer, pending: { text: string }) {
    pending.text += chunk.toString("utf8");
    const parts = pending.text.split(/\r?\n|\r/);
    pending.text = parts.pop() ?? "";
    for(const line of parts) {
      // Drop colour and cursor codes: the output is read as plain text.
      // eslint-disable-next-line no-control-regex
      const clean = line.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "").trimEnd();
      if(clean) run.tail.push(clean);
    }
    if(run.tail.length > TAIL_LINES) run.tail.splice(0, run.tail.length - TAIL_LINES);
  }

  const externalCache = new Map<number, { command: RunCommand, stage: string, cwd?: string } | null>();
  const rootReal = safeRealpath(root);

  async function externals(): Promise<RunInfo[]> {
    const dir = join(root, ".alchemy", "log");
    let files: string[];
    try {
      files = (await readdir(dir)).filter(f => f.endsWith(".ndjson")).sort().slice(-LOG_FILES);
    } catch {
      return [];
    }
    const found: RunInfo[] = [];
    for(const file of files) {
      const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}).*-pid(\d+)\.ndjson$/.exec(file);
      if(!match) continue;
      const pid = Number(match[5]);
      try {
        process.kill(pid, 0);
      } catch {
        continue;
      }
      if(!externalCache.has(pid)) externalCache.set(pid, await describe(pid));
      const run = externalCache.get(pid);
      if(!run) continue;
      // The log folder says the run is this project's; the working directory confirms it.
      if(run.cwd && safeRealpath(run.cwd) !== rootReal) continue;
      found.push({ ...run, pid, startedAt: Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) || 0, owned: false });
    }
    return found;
  }

  /** The Alchemy command a pid is running, from its command line. */
  async function describe(pid: number): Promise<{ command: RunCommand, stage: string, cwd?: string } | null> {
    let line: string;
    try {
      line = (await exec("ps", ["-o", "command=", "-p", String(pid)])).stdout.trim();
    } catch {
      return null;
    }
    const words = line.split(/\s+/);
    const at = words.findIndex(w => /(^|\/)alchemy(\.js)?$/.test(w));
    if(at < 0) return null;
    const command = RUN_COMMANDS.find(c => c === words[at + 1]);
    if(!command) return null;
    const flag = words.findIndex(w => w === "--stage" || w.startsWith("--stage="));
    const stage = flag < 0 ? defaultStage : words[flag]!.includes("=") ? words[flag]!.split("=")[1]! : words[flag + 1] ?? defaultStage;
    return { command, stage, cwd: await cwdOf(pid) };
  }

  async function cwdOf(pid: number): Promise<string | undefined> {
    try {
      const out = (await exec("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])).stdout;
      return out.split("\n").find(l => l.startsWith("n"))?.slice(1);
    } catch {
      return undefined;
    }
  }

  return {
    async status() {
      const runs: RunInfo[] = [];
      if(current) runs.push(current.info);
      for(const run of await externals()) {
        // The dashboard's own run writes its log under a pid of its own; don't count it twice.
        if(current && run.command === current.info.command && run.stage === current.info.stage) continue;
        runs.push(run);
      }
      return { runs, last, output: current ? current.tail.slice(-40) : [] };
    },

    async start({ command, stage, confirm }) {
      if(!RUN_COMMANDS.includes(command as RunCommand)) throw new RunInputError(`Unknown command '${String(command)}'.`);
      if(typeof stage !== "string" || !STAGE_PATTERN.test(stage)) throw new RunInputError("A stage name is letters, numbers, '-' and '_', and starts with a letter or number.");
      // Destroy removes real resources: the caller has to have shown the stage name to the user.
      if(command === "destroy" && confirm !== stage) throw new RunInputError("Destroy needs the stage name as confirmation.");
      if(current) throw new RunConflict(`${current.info.command} is already running on ${current.info.stage}. Stop it first.`);
      const busy = (await externals()).find(r => r.stage === stage);
      if(busy) throw new RunConflict(`${busy.command} is already running on ${stage} in a terminal (pid ${busy.pid}).`);

      const [bin, prefix] = alchemyBin();
      const args = [...prefix, command as string, "--stage", stage, "--config", entrypoint];
      if(command !== "dev") args.push("--yes");
      const child = spawn(bin, args, {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
      });
      const info: RunInfo = { command: command as RunCommand, stage, pid: child.pid ?? 0, startedAt: Date.now(), owned: true };
      let resolveDone!: () => void;
      const run: ActiveRun = { info, child, stopped: false, tail: [], done: new Promise<void>(ok => (resolveDone = ok)) };
      current = run;

      const out = { text: "" };
      const err = { text: "" };
      child.stdout!.on("data", (c: Buffer) => collect(run, c, out));
      child.stderr!.on("data", (c: Buffer) => collect(run, c, err));
      function finish(code: number | null, failure?: string) {
        if(current !== run) return;
        clearTimeout(run.killTimer);
        for(const rest of [out.text, err.text]) if(rest.trim()) run.tail.push(rest.trim());
        if(failure) run.tail.push(failure);
        last = { command: info.command, stage: info.stage, code, stopped: run.stopped, endedAt: Date.now(), tail: run.tail.slice(-60) };
        current = undefined;
        resolveDone();
        options.onExit?.();
      }
      child.once("error", error => finish(null, `Couldn't start '${bin}': ${error.message}`));
      child.once("close", code => finish(code));
    },

    async stop(pid) {
      if(pid !== undefined && pid !== current?.info.pid) {
        // Only a run this project's status lists: never an arbitrary pid.
        const target = (await externals()).find(r => r.pid === pid);
        if(!target) throw new RunInputError(`No Alchemy run with pid ${String(pid)} in this project.`);
        signalThenKill(target.pid);
        return;
      }
      const run = current;
      if(!run || run.stopped) return;
      run.stopped = true;
      // The same signal Ctrl-C sends, so `dev` can shut its simulators down cleanly.
      run.child.kill("SIGINT");
      run.killTimer = setTimeout(() => run.child.kill("SIGKILL"), KILL_AFTER_MS);
    },

    async close() {
      const run = current;
      if(!run) return;
      await this.stop();
      await run.done;
    }
  };
}
