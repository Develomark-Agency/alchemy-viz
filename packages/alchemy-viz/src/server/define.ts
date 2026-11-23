/**
 * `alchemy-viz/server`: the server half of a view or page.
 *
 * Handlers run in the alchemy-viz process (Node-side, with filesystem and
 * the project's dependencies), never in the browser. A view calls them
 * through the typed `api` object `defineView` hands it.
 */
import type { ResourceInfo, StackInfo } from "../types.ts";

export interface HandlerContext<Attr = any, Props = any> {
  /** The resource the view is showing. Undefined for pages. */
  resource: ResourceInfo<Attr, Props> | undefined,
  stack: StackInfo,
  /** Absolute project root. */
  root: string,
  /** Resolve a module from the user's project (its copy of `alchemy`, `effect`, ...). */
  importFromProject<T = any>(specifier: string, options?: { via?: string }): Promise<T>
}

/**
 * A handler takes JSON input and returns JSON, a `Response` (streamed as-is,
 * e.g. a file download), or an Effect producing either.
 */
export type Handler<I = any, O = any> = (input: I, ctx: HandlerContext) => O | Promise<O>;

export type Handlers = Record<string, Handler<any, any>>;

export interface ServerDefinition<H extends Handlers = Handlers> {
  readonly __alchemyViz: "server",
  readonly handlers: H
}

export function defineServer<H extends Handlers>(handlers: H): ServerDefinition<H> {
  return {
    __alchemyViz: "server",
    handlers
  };
}

/** Helper for handlers that need the resource: throws a clear error on pages. */
export function requireResource<Attr = any, Props = any>(ctx: HandlerContext<Attr, Props>) {
  if(!ctx.resource) throw new Error("This handler needs a resource and was called from a page.");
  return ctx.resource;
}
