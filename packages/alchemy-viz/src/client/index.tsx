/**
 * `alchemy-viz/client`: the browser half of a view or page.
 *
 * ```tsx
 * import type server from "./server.ts";
 * import { defineView } from "alchemy-viz/client";
 *
 * export default defineView<typeof server>(({ resource, api }) => {
 *   const items = api.list.useQuery({ prefix: "" });
 *   ...
 * });
 * ```
 */
import {
  type AnchorHTMLAttributes,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import type { Handler, ServerDefinition } from "../server/define.ts";
import type { ResourceInfo, StackInfo } from "../types.ts";

export type { ResourceInfo, StackInfo } from "../types.ts";

// ---------------------------------------------------------------------------
// Typed API

type InputOf<H> = H extends (input: infer I, ...rest: any[]) => any ? I : undefined;
type OutputOf<H> = H extends (...args: any[]) => infer O ? Awaited<O> : never;
type Args<I> = undefined extends I ? [input?: I] : [input: I];

export interface QueryState<O> {
  data: O | undefined,
  error: Error | undefined,
  loading: boolean,
  refetch: () => void
}

export interface QueryOptions {
  /** Skip the call while false. */
  enabled?: boolean,
  /** Re-run every N ms (live views such as logs). */
  refreshInterval?: number
}

export interface MutationState<I, O> {
  run: (...args: Args<I>) => Promise<O>,
  pending: boolean,
  error: Error | undefined,
  data: O | undefined,
  reset: () => void
}

export interface HandlerClient<I, O> {
  call: (...args: Args<I>) => Promise<O>,
  useQuery: (...args: [...Args<I>, QueryOptions?]) => QueryState<O>,
  useMutation: () => MutationState<I, O>,
  /** A GET URL for the handler, for links, `<img src>` and downloads. */
  url: (...args: Args<I>) => string
}

export type Api<S> =
  S extends ServerDefinition<infer H>
    ? { [K in keyof H]: H[K] extends Handler ? HandlerClient<InputOf<H[K]>, OutputOf<H[K]>> : never }
    : Record<string, never>;

export type RpcTarget = { fqn: string } | { page: string };

export class RpcError extends Error {}

async function rpc(target: RpcTarget, handler: string, input: unknown) {
  const res = await fetch("/__viz/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target, handler, input: input ?? null })
  });
  const type = res.headers.get("content-type") ?? "";
  if(!type.includes("application/json")) {
    if(!res.ok) throw new RpcError(await res.text());
    return res;
  }
  const body = (await res.json()) as { result?: unknown, error?: string };
  if(!res.ok || body.error) throw new RpcError(body.error ?? `HTTP ${res.status}`);
  return "result" in body ? body.result : body;
}

// Every successful mutation bumps this version, so queries refetch after a
// write without views wiring it up. The shell's refresh button bumps it too.
let version = 0;
const listeners = new Set<() => void>();
export function invalidate() {
  version++;
  for(const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function useVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

function toError(e: unknown) {
  return (e instanceof Error ? e : new Error(String(e)));
}

function makeHandlerClient(target: RpcTarget, name: string): HandlerClient<any, any> {
  function call(input?: unknown) {
    return rpc(target, name, input);
  }
  return {
    call,
    url: (input?: unknown) => `/__viz/api/rpc?${new URLSearchParams({
      target: JSON.stringify(target),
      handler: name,
      input: JSON.stringify(input ?? null)
    })}`,
    useQuery: (...args: any[]) => {
      const input = args[0];
      const options: QueryOptions = args[1] ?? {};
      const enabled = options.enabled ?? true;
      const key = JSON.stringify(input ?? null);
      const v = useVersion();
      const [tick, setTick] = useState(0);
      const [state, setState] = useState<{ data?: unknown, error?: Error, loading: boolean }>({
        loading: enabled
      });
      const lastKey = useRef<string | undefined>(undefined);
      useEffect(() => {
        if(!enabled) return;
        let cancelled = false;
        // Keep showing old data while refetching the same key; clear it for a new key.
        const sameKey = lastKey.current === key;
        lastKey.current = key;
        setState(s => ({ data: sameKey ? s.data : undefined, error: undefined, loading: true }));
        call(JSON.parse(key)).then(
          data => !cancelled && setState({ data, loading: false }),
          e => !cancelled && setState(s => ({ data: sameKey ? s.data : undefined, error: toError(e), loading: false }))
        );
        return () => {
          cancelled = true;
        };
      }, [key, enabled, v, tick]);
      useEffect(() => {
        if(!enabled || !options.refreshInterval) return;
        const id = setInterval(() => setTick(t => t + 1), options.refreshInterval);
        return () => clearInterval(id);
      }, [enabled, options.refreshInterval]);
      return {
        data: state.data,
        error: state.error,
        loading: state.loading,
        refetch: useCallback(() => setTick(t => t + 1), [])
      };
    },
    useMutation: () => {
      const [state, setState] = useState<{ pending: boolean, error?: Error, data?: unknown }>({ pending: false });
      const run = useCallback(async (input?: unknown) => {
        setState({ pending: true });
        try {
          const data = await call(input);
          setState({ pending: false, data });
          invalidate();
          return data;
        } catch (e) {
          setState({ pending: false, error: toError(e) });
          throw e;
        }
      }, []);
      return { ...state, run, reset: useCallback(() => setState({ pending: false }), []) } as MutationState<any, any>;
    }
  };
}

/** Build the `api` object for a resource or page. Used by the shell. */
export function makeApi<S>(target: RpcTarget): Api<S> {
  return new Proxy({} as Record<string, HandlerClient<any, any>>, {
    get: (cache, name) => {
      if(typeof name !== "string") return undefined;
      return (cache[name] ??= makeHandlerClient(target, name));
    }
  }) as Api<S>;
}

// ---------------------------------------------------------------------------
// Views and pages

export interface ViewProps<S = undefined> {
  resource: ResourceInfo,
  stack: StackInfo,
  api: Api<S>
}

export interface PageProps<S = undefined> {
  stack: StackInfo,
  api: Api<S>
}

export interface ViewDefinition<S = any> {
  readonly __alchemyViz: "view",
  readonly component: (props: ViewProps<S>) => ReactNode
}

export interface PageDefinition<S = any> {
  readonly __alchemyViz: "page",
  readonly component: (props: PageProps<S>) => ReactNode
}

export function defineView<S = undefined>(component: (props: ViewProps<S>) => ReactNode): ViewDefinition<S> {
  return {
    __alchemyViz: "view",
    component
  };
}

export function definePage<S = undefined>(component: (props: PageProps<S>) => ReactNode): PageDefinition<S> {
  return {
    __alchemyViz: "page",
    component
  };
}

// ---------------------------------------------------------------------------
// Navigation

export const NavigateContext = createContext<(path: string) => void>(path => {
  window.location.href = path;
});

export function useNavigate() {
  return useContext(NavigateContext);
}

export function resourcePath(fqn: string) {
  return `/r/${encodeURIComponent(fqn)}`;
}

/** Link to another resource's page, e.g. from a Worker binding to its KV namespace. */
export function ResourceLink({
  fqn,
  children,
  ...rest
}: { fqn: string, children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useNavigate();
  const href = resourcePath(fqn);
  return (
    <a
      {...rest}
      href={href}
      onClick={e => {
        if(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children ?? fqn}
    </a>
  );
}
