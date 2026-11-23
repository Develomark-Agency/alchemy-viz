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
 *
 * Every handler on `api` is backed by TanStack Query: results are cached
 * per resource, handler and input, and a successful mutation refetches the
 * resource's queries.
 */
import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery as useInfiniteQueryBase,
  useMutation as useMutationBase,
  useQuery as useQueryBase,
  useQueryClient,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult
} from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import type { Handler, ServerDefinition } from "../server/define.ts";
import type { ResourceInfo, StackInfo } from "../types.ts";

export type { ResourceInfo, StackInfo } from "../types.ts";
export { useQueryClient };

// ---------------------------------------------------------------------------
// Typed API

type InputOf<H> = H extends (input: infer I, ...rest: any[]) => any ? I : undefined;
type OutputOf<H> = H extends (...args: any[]) => infer O ? Awaited<O> : never;
type Args<I> = undefined extends I ? [input?: I] : [input: I];
type Vars<I> = undefined extends I ? I | void : I;

export type QueryOptions<O> = Omit<UseQueryOptions<O, Error, O>, "queryKey" | "queryFn">;

export interface InfiniteOptions<O> {
  /** The cursor for the page after `last`, or undefined when there are no more. */
  getNextCursor: (last: O) => string | undefined | null,
  enabled?: boolean
}

export interface HandlerClient<I, O> {
  /** Call the handler directly, outside React. */
  call: (...args: Args<I>) => Promise<O>,
  /** The TanStack Query key for this handler and input. */
  key: (...args: Args<I>) => QueryKey,
  useQuery: (...args: [...Args<I>, QueryOptions<O>?]) => UseQueryResult<O, Error>,
  /**
   * Cursor pagination: the handler is called with `{ ...input, cursor }`
   * for each page.
   */
  useInfiniteQuery: (input: Omit<NonNullable<I>, "cursor">, options: InfiniteOptions<O>) => UseInfiniteQueryResult<InfiniteData<O, string | undefined>, Error>,
  /** Successful calls refetch every query of the same resource or page. */
  useMutation: (options?: Omit<UseMutationOptions<O, Error, Vars<I>>, "mutationFn">) => UseMutationResult<O, Error, Vars<I>>,
  /** A GET URL for the handler, for links, `<img src>` and downloads. */
  url: (...args: Args<I>) => string
}

export type Api<S> = S extends ServerDefinition<infer H>
  ? { [K in keyof H]: H[K] extends Handler ? HandlerClient<InputOf<H[K]>, OutputOf<H[K]>> : never }
  : Record<string, never>;

export type RpcTarget = { fqn: string } | { page: string };

export class RpcError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function rpc(target: RpcTarget, handler: string, input: unknown) {
  const res = await fetch("/__viz/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target, handler, input: input ?? null })
  });
  const type = res.headers.get("content-type") ?? "";
  if(!type.includes("application/json")) {
    if(!res.ok) throw new RpcError(await res.text(), res.status);
    return res;
  }
  const body = (await res.json()) as { result?: unknown, error?: string };
  if(!res.ok || body.error) throw new RpcError(body.error ?? `HTTP ${res.status}`, res.status);
  return body.result;
}

function targetKey(target: RpcTarget) {
  return "fqn" in target ? `r:${target.fqn}` : `p:${target.page}`;
}

function makeHandlerClient(target: RpcTarget, name: string): HandlerClient<any, any> {
  const scope = ["rpc", targetKey(target)];
  function key(input?: unknown) {
    return [...scope, name, input ?? null];
  }
  function call(input?: unknown) {
    return rpc(target, name, input);
  }
  return {
    call,
    key,
    url: (input?: unknown) => `/__viz/api/rpc?${new URLSearchParams({
      target: JSON.stringify(target),
      handler: name,
      input: JSON.stringify(input ?? null)
    })}`,
    useQuery: (...args: any[]) => {
      const [input, options] = args as [unknown, QueryOptions<unknown> | undefined];
      return useQueryBase({ queryKey: key(input), queryFn: () => call(input), ...options });
    },
    useInfiniteQuery: (input, options) => useInfiniteQueryBase({
      queryKey: [...key(input), "pages"],
      queryFn: ({ pageParam }) => call({ ...(input as object), cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: last => options.getNextCursor(last) ?? undefined,
      enabled: options.enabled
    }),
    useMutation: options => {
      const client = useQueryClient();
      return useMutationBase({
        ...options,
        mutationFn: (input: unknown) => call(input),
        onSuccess: async (...args) => {
          await client.invalidateQueries({ queryKey: scope });
          await (options?.onSuccess as ((...a: unknown[]) => unknown) | undefined)?.(...args);
        }
      });
    }
  };
}

/** Builds the `api` object for a resource or page. Used by the shell. */
export function makeApi<S>(target: RpcTarget): Api<S> {
  const cache: Record<string, HandlerClient<any, any>> = {};
  return new Proxy(cache, {
    get: (_, name) => (typeof name === "string" ? (cache[name] ??= makeHandlerClient(target, name)) : undefined)
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
  return { __alchemyViz: "view", component };
}

export function definePage<S = undefined>(component: (props: PageProps<S>) => ReactNode): PageDefinition<S> {
  return { __alchemyViz: "page", component };
}

// ---------------------------------------------------------------------------
// Navigation and URL state

/** Link to another resource's page, e.g. from a Worker binding to its KV namespace. */
export function ResourceLink({ fqn, children, ...rest }: { fqn: string, children?: ReactNode } & Omit<ComponentProps<"a">, "href">) {
  return (
    <Link to="/r/$fqn" params={{ fqn }} {...rest}>
      {children ?? fqn}
    </Link>
  );
}

/** Navigate to a resource's page from code. */
export function useOpenResource() {
  const navigate = useNavigate();
  return useCallback((fqn: string, tab?: string) => navigate({ to: "/r/$fqn", params: { fqn }, search: tab ? { tab } : {} }), [navigate]);
}

/**
 * State kept in the URL's query string, so a reload or a shared link opens
 * the view in the same place (the selected key, the open table, ...).
 */
export function useUrlState(name: string): [string | undefined, (value: string | undefined) => void] {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const raw = search[name];
  const value = raw === undefined || raw === null ? undefined : String(raw);
  const set = useCallback(
    (next: string | undefined) => navigate({
      to: ".",
      replace: true,
      search: (prev: Record<string, unknown>) => {
        const out = { ...prev };
        if(next === undefined || next === "") delete out[name];
        else out[name] = next;
        return out;
      }
    } as never),
    [navigate, name]
  );
  return [value, set];
}
