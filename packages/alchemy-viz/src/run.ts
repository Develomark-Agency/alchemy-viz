/**
 * Alchemy runs the dashboard can start, and what it reports about them.
 * Plain JSON, shared by the server and the browser.
 */

export const RUN_COMMANDS = ["dev", "deploy", "destroy"] as const;
export type RunCommand = typeof RUN_COMMANDS[number];

/** A stage name goes onto a command line, so it is kept to a safe, portable set. */
export const STAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;

export interface RunInfo {
  command: RunCommand,
  stage: string,
  pid: number,
  /** Epoch ms. */
  startedAt: number,
  /** True when the dashboard started it; false for one running in a terminal. */
  owned: boolean,
  /** Its working directory, when known. */
  cwd?: string
}

export interface RunResult {
  command: RunCommand,
  stage: string,
  /** Exit code, or null when a signal ended it. */
  code: number | null,
  /** True when the dashboard stopped it on request. */
  stopped: boolean,
  endedAt: number,
  /** The last lines of its output. */
  tail: string[]
}

export interface RunStatus {
  /** Every run in progress for this project, the dashboard's own and ones in a terminal. */
  runs: RunInfo[],
  /** The latest run the dashboard started that has ended. */
  last?: RunResult,
  /** The last lines of output from the run the dashboard started and is still running. */
  output: string[]
}
