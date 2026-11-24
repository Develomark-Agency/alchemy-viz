import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from "@ui-sdk/react/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, Play, Rocket, ScrollText, Square, Terminal, Trash2 } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, cn, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogTitle, formatRelative, Input, TerminalOutput, type TagLinker, toast } from "../../ui/index.ts";
import type { RunCommand, RunInfo, RunResult, RunStatus } from "../../run.ts";
import { useRefresh, useStack } from "./use-stack.ts";

export const runKey = ["run"] as const;

export async function fetchRun(): Promise<RunStatus> {
  const res = await fetch("/__viz/api/run");
  const body = await res.json();
  if(!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

async function postRun(body: Record<string, unknown>): Promise<RunStatus> {
  const res = await fetch("/__viz/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if(!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const commandLabels: Record<RunCommand, { verb: string, doing: string, done: string }> = {
  dev: { verb: "Start dev", doing: "Dev", done: "Dev" },
  deploy: { verb: "Deploy", doing: "Deploying", done: "Deploy" },
  destroy: { verb: "Destroy", doing: "Destroying", done: "Destroy" }
};

interface RunControls {
  /** The stage the actions apply to: the one on screen. */
  stage: string | undefined,
  /** True when that stage has no resources, so running there creates them. */
  isNewStage: boolean,
  /** Runs on this stage (the dashboard's own, or a terminal's). */
  here: RunInfo[],
  /** Every run in progress for this project, on any stage. */
  all: RunInfo[],
  /** The dashboard's own run, on any stage. */
  owned: RunInfo | undefined,
  last: RunResult | undefined,
  /** Why a command can't start right now, if it can't. */
  blocked: (command: RunCommand) => string | undefined,
  /** Starts a command, asking first when it changes the cloud. */
  request: (command: RunCommand) => void,
  /** Stops the dashboard's own run, or the run with this pid. */
  stop: (pid?: number) => Promise<void>,
  showOutput: () => void,
  showProcesses: () => void
}

const Controls = createContext<RunControls | undefined>(undefined);

export function useRun(): RunControls {
  const value = useContext(Controls);
  if(!value) throw new Error("useRun needs a RunProvider.");
  return value;
}

/** Owns the run status and the dialogs that guard its actions, for the top bar and the palette. */
export function RunProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const refresh = useRefresh();
  const { data } = useStack();
  const stage = data?.stack.stage;
  // The store lists any stage that has been looked at, so "new" means nothing is recorded in it.
  const isNewStage = !!data && data.stack.resources.length === 0;

  const { data: status } = useQuery({
    queryKey: runKey,
    queryFn: fetchRun,
    refetchInterval: query => (query.state.data?.runs.length ? 1_500 : 5_000),
    placeholderData: previous => previous
  });

  const here = useMemo(() => status?.runs.filter(r => r.stage === stage) ?? [], [status, stage]);
  const all = useMemo(() => status?.runs ?? [], [status]);
  const owned = status?.runs.find(r => r.owned);
  const last = status?.last;

  // A run changes state: re-read it when the dashboard's own run ends, and say how it went.
  const seenEnd = useRef<number | undefined>(undefined);
  const primed = useRef(false);
  useEffect(() => {
    if(!status) return;
    if(!primed.current) {
      primed.current = true;
      seenEnd.current = status.last?.endedAt;
      return;
    }
    const ended = status.last;
    if(!ended || ended.endedAt === seenEnd.current) return;
    seenEnd.current = ended.endedAt;
    refresh();
    const name = commandLabels[ended.command].done;
    if(ended.stopped) toast(`${name} stopped`, { description: ended.stage });
    else if(ended.code === 0) toast(`${name} finished`, { description: ended.stage });
    else toast(`${name} failed`, { description: `${ended.stage}: ${ended.tail.at(-1) ?? `exit code ${ended.code}`}` });
  }, [status, refresh]);

  const [confirming, setConfirming] = useState<RunCommand | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [processesOpen, setProcessesOpen] = useState(false);

  const blocked = useCallback((command: RunCommand): string | undefined => {
    if(!stage) return "Reading the stack…";
    const external = here.find(r => !r.owned);
    if(external) return `${external.command} is running in a terminal on ${stage}`;
    if(owned) return owned.stage === stage ? `${commandLabels[owned.command].doing} on ${stage}` : `${owned.command} is running on ${owned.stage}`;
    if(command === "destroy" && isNewStage) return `${stage} has nothing to destroy`;
    return undefined;
  }, [stage, here, owned, isNewStage]);

  const start = useCallback(async (command: RunCommand, confirm?: string) => {
    try {
      client.setQueryData(runKey, await postRun({ action: "start", command, stage, confirm }));
      // Dev is long-lived and chatty: show its output so the user can watch it come up.
      if(command === "dev") setOutputOpen(true);
    } catch (error) {
      toast("Couldn't start", { description: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }, [client, stage]);

  const controls = useMemo<RunControls>(() => ({
    stage,
    isNewStage,
    here,
    all,
    owned,
    last,
    blocked,
    // Dev only runs the stack locally; the others change real resources, so they ask.
    request: command => {
      if(blocked(command)) return;
      if(command === "dev") start("dev").catch(() => {});
      else setConfirming(command);
    },
    stop: async pid => {
      try {
        client.setQueryData(runKey, await postRun({ action: "stop", pid }));
      } catch (error) {
        toast("Couldn't stop", { description: error instanceof Error ? error.message : String(error) });
      }
    },
    showOutput: () => setOutputOpen(true),
    showProcesses: () => setProcessesOpen(true)
  }), [stage, isNewStage, here, all, owned, last, blocked, start, client]);

  return (
    <Controls.Provider value={controls}>
      {children}
      <ConfirmRunDialog
        command={confirming}
        stage={stage}
        isNewStage={isNewStage}
        onClose={() => setConfirming(null)}
        onConfirm={async (command, typed) => {
          await start(command, typed);
          setConfirming(null);
        }}
      />
      <ProcessesDialog open={processesOpen} onOpenChange={setProcessesOpen} runs={all} stop={controls.stop} />
      <OutputDialog open={outputOpen} onOpenChange={setOutputOpen} status={status} />
    </Controls.Provider>
  );
}

function ConfirmRunDialog({ command, stage, isNewStage, onClose, onConfirm }: {
  command: RunCommand | null,
  stage: string | undefined,
  isNewStage: boolean,
  onClose: () => void,
  onConfirm: (command: RunCommand, typed: string) => Promise<void>
}) {
  const [typed, setTyped] = useState("");
  // Keep the last command around so the text doesn't change while the dialog fades out.
  const shown = useRef<RunCommand>("deploy");
  if(command) shown.current = command;
  useEffect(() => setTyped(""), [command]);
  const kind = shown.current;
  const destroy = kind === "destroy";
  const ready = !destroy || typed === stage;

  return (
    <Dialog open={command !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="w-[min(440px,calc(100vw-32px))]">
        <DialogTitle>{destroy ? "Destroy" : "Deploy to"} <span className="font-mono text-[13px]">{stage}</span>?</DialogTitle>
        <DialogDescription>
          {destroy
            ? "This deletes every resource in this stage, in the cloud and locally. It can't be undone."
            : isNewStage
              ? "This stage has no resources yet. Deploying creates them in the cloud."
              : "This applies the stack's changes to this stage's real cloud resources."}
        </DialogDescription>
        <form
          onSubmit={event => {
            event.preventDefault();
            if(ready && command) onConfirm(command, typed).catch(() => {});
          }}
          className="contents"
        >
          <DialogBody className={destroy ? undefined : "hidden"}>
            <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
              <span>Type <span className="font-mono text-fg">{stage}</span> to confirm</span>
              <Input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant={destroy ? "danger" : "primary"}
              disabled={!ready}
              className={destroy ? "border-danger bg-danger text-white hover:bg-danger/90 hover:text-white disabled:border-line-strong disabled:bg-surface disabled:text-danger" : undefined}
            >
              {commandLabels[kind].verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OutputDialog({ open, onOpenChange, status }: { open: boolean, onOpenChange: (open: boolean) => void, status: RunStatus | undefined }) {
  const { data } = useStack();
  const live = status?.runs.find(r => r.owned);
  const ran = live ?? status?.last;
  const lines = live ? status!.output : status?.last?.tail ?? [];
  const title = live ? `${commandLabels[live.command].doing} on ${live.stage}` : status?.last ? `${commandLabels[status.last.command].done} on ${status.last.stage}` : "Output";

  // A log tag names a resource (`[Api]`), or one of its parts (`[Api/UPLOADS]`).
  const resources = data?.stack.resources;
  const linkTag = useMemo<TagLinker>(() => tag => {
    const target = resources?.find(r => r.fqn === tag || r.logicalId === tag) ?? resources?.find(r => r.logicalId === tag.split("/")[0]);
    if(!target) return undefined;
    return (
      <Link to="/r/$fqn" params={{ fqn: target.fqn }} onClick={() => onOpenChange(false)} title={`Open ${target.logicalId}`}>
        {`[${tag}]`}
      </Link>
    );
  }, [resources, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(860px,calc(100vw-32px))]">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {live
            ? <>Running. These logs are also on the <Link to="/logs" onClick={() => onOpenChange(false)} className="underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-current">Logs page</Link>.</>
            : status?.last ? (status.last.stopped ? "Stopped." : status.last.code === 0 ? "Finished." : `Exited with code ${status.last.code}.`) : "Nothing has run from the dashboard yet."}
        </DialogDescription>
        <DialogBody>
          <TerminalOutput
            title={ran ? `alchemy ${ran.command} --stage ${ran.stage}` : "alchemy"}
            lines={lines}
            live={!!live}
            linkTag={linkTag}
            empty={live ? "Waiting for output…" : "No output."}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ProcessesDialog({ open, onOpenChange, runs, stop }: { open: boolean, onOpenChange: (open: boolean) => void, runs: RunInfo[], stop: (pid: number) => Promise<void> }) {
  // A stopped process takes a moment to exit; its row says so until it's gone from the list.
  const [stopping, setStopping] = useState<Set<number>>(new Set());
  useEffect(() => {
    setStopping(prev => {
      const live = new Set(runs.map(r => r.pid));
      const next = new Set([...prev].filter(pid => live.has(pid)));
      return next.size === prev.size ? prev : next;
    });
  }, [runs]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(640px,calc(100vw-32px))]">
        <DialogTitle>Running processes</DialogTitle>
        <DialogDescription>Alchemy runs for this project, whether the dashboard started them or a terminal did.</DialogDescription>
        <DialogBody className="gap-2">
          {runs.length === 0
            ? <p className="py-6 text-center text-[13px] text-fg-muted">Nothing is running.</p>
            : runs.map(r => (
              <div key={r.pid} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                <span className="size-2 shrink-0 rounded-full bg-ok" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2 text-[13px]">
                    <span className="font-medium">alchemy {r.command}</span>
                    <span className="truncate font-mono text-xs text-fg-muted">{r.stage}</span>
                  </div>
                  <div className="text-xs text-fg-subtle">
                    pid {r.pid} · started {formatRelative(r.startedAt)} · {r.owned ? "from the dashboard" : "from a terminal"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={stopping.has(r.pid)}
                  onClick={async () => {
                    setStopping(prev => new Set(prev).add(r.pid));
                    await stop(r.pid);
                  }}
                >
                  {stopping.has(r.pid) ? "Stopping…" : "Stop"}
                </Button>
              </div>
            ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const popup = "z-50 min-w-64 rounded-lg border border-line bg-surface p-1 text-[13px] shadow-popup outline-none origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-97 data-starting-style:opacity-0 data-ending-style:opacity-0";
const menuItem = "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-hover [&_svg]:size-3.5 [&_svg]:text-fg-subtle";
const groupLabel = "px-2 pt-1.5 pb-1 text-[11px] font-medium text-fg-subtle";

/** The top bar's run control: what is running on this stage, and the actions. */
export function RunMenu() {
  const run = useRun();
  if(!run.stage) return null;
  const doing = run.here[0];
  const devHere = run.here.find(r => r.command === "dev");
  const ownedHere = run.owned?.stage === run.stage ? run.owned : undefined;
  const failed = run.last && run.last.code !== 0 && !run.last.stopped && run.last.stage === run.stage;

  const label = doing ? (doing.command === "dev" ? "Dev running" : commandLabels[doing.command].doing) : "Run";
  const busyOneShot = doing && doing.command !== "dev";

  return (
    <Menu>
      <MenuTrigger
        aria-label={doing ? `${label} on ${run.stage}` : "Run commands"}
        className="flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-[13px] text-fg-muted shadow-xs transition-colors hover:border-line-strong hover:text-fg data-open:bg-hover data-open:text-fg"
      >
        {busyOneShot
          ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
          : devHere
            ? <span className="size-2 rounded-full bg-ok" />
            : failed
              ? <span className="size-2 rounded-full bg-danger" />
              : <Play className="size-3.5" />}
        <span className="hidden lg:inline">{label}</span>
      </MenuTrigger>
      <MenuContent align="end" sideOffset={6} className={popup}>
        <MenuGroup>
          <MenuGroupLabel className={groupLabel}>
            Run on <span className="font-mono">{run.stage}</span>
          </MenuGroupLabel>
          {devHere && !ownedHere
            ? (
              <MenuItem onClick={run.showProcesses} className={menuItem}>
                <Terminal />
                <span className="flex-1">Dev is running in a terminal</span>
                <span className="text-[11px] text-fg-subtle">manage</span>
              </MenuItem>
            )
            : devHere
              ? (
                <MenuItem onClick={() => run.stop()} className={menuItem}>
                  <Square />
                  Stop dev
                </MenuItem>
              )
              : (
                <MenuItem disabled={!!run.blocked("dev")} onClick={() => run.request("dev")} className={menuItem}>
                  <Play />
                  Start dev
                </MenuItem>
              )}
          <MenuItem disabled={!!run.blocked("deploy")} onClick={() => run.request("deploy")} className={menuItem}>
            <Rocket />
            <span className="flex-1">Deploy…</span>
            {run.isNewStage && <span className="text-[11px] text-fg-subtle">empty stage</span>}
          </MenuItem>
          {ownedHere && !devHere && (
            <MenuItem onClick={() => run.stop()} className={menuItem}>
              <Square />
              Stop {commandLabels[ownedHere.command].doing.toLowerCase()}
            </MenuItem>
          )}
          <MenuItem disabled={!!run.blocked("destroy")} onClick={() => run.request("destroy")} className={cn(menuItem, "text-danger [&_svg]:text-danger")}>
            <Trash2 />
            Destroy…
          </MenuItem>
        </MenuGroup>
        {(run.owned || run.last || run.all.length > 0) && <MenuSeparator className="my-1 h-px bg-line" />}
        {run.all.length > 0 && (
          <MenuItem onClick={run.showProcesses} className={menuItem}>
            <Activity />
            <span className="flex-1">Running processes</span>
            <span className="text-[11px] text-fg-subtle">{run.all.length}</span>
          </MenuItem>
        )}
        {(run.owned || run.last) && (
          <MenuItem onClick={run.showOutput} className={menuItem}>
            <ScrollText />
            <span className="flex-1">{run.owned ? "View output" : failed ? "Last run failed: view output" : "View last output"}</span>
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
