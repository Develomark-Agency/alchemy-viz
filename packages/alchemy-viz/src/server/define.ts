/**
 * `alchemy-viz/server`: the server half of a view or page.
 *
 * Handlers run in the alchemy-viz process (with the filesystem and the
 * project's dependencies), never in the browser. A view calls them through
 * the typed `api` object `defineView` hands it.
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ResourceInfo, StackInfo } from "../types.ts";

export type { StandardSchemaV1 } from "@standard-schema/spec";

export interface HandlerContext<Attr = any, Props = any> {
  /** The resource the view is showing. Undefined for pages. */
  resource: ResourceInfo<Attr, Props> | undefined,
  stack: StackInfo,
  /** Absolute project root. */
  root: string,
  /** Resolve a module from the user's project (its copy of `alchemy`, `effect`, ...). */
  importFromProject<T = any>(specifier: string, options?: { via?: string }): Promise<T>
}

export const SCHEMA = Symbol.for("alchemy-viz.schema");

/**
 * A handler takes JSON input and returns JSON, a `Response` (sent as-is,
 * e.g. a file download), or an Effect producing either. Handlers made with
 * {@link handler} validate their input first.
 */
export type Handler<I = any, O = any> = ((input: I, ctx: HandlerContext) => O | Promise<O>) & {
  readonly [SCHEMA]?: StandardSchemaV1
};

export type Handlers = Record<string, Handler<any, any>>;

export interface ServerDefinition<H extends Handlers = Handlers> {
  readonly __alchemyViz: "server",
  readonly handlers: H
}

export function defineServer<H extends Handlers>(handlers: H): ServerDefinition<H> {
  return { __alchemyViz: "server", handlers };
}

/**
 * A handler whose input is validated with any Standard Schema (Zod, Effect
 * Schema, Valibot, ArkType, ...). The browser gets the schema's input type;
 * the function gets its parsed output.
 *
 * ```ts
 * list: handler(z.object({ prefix: z.string().default("") }), async (input, ctx) => …)
 * ```
 */
export function handler<S extends StandardSchemaV1, O>(
  schema: S,
  fn: (input: StandardSchemaV1.InferOutput<S>, ctx: HandlerContext) => O | Promise<O>
): Handler<StandardSchemaV1.InferInput<S>, O> {
  return Object.assign((input: StandardSchemaV1.InferInput<S>, ctx: HandlerContext) => fn(input as StandardSchemaV1.InferOutput<S>, ctx), {
    [SCHEMA]: schema
  });
}

/** Thrown for input that fails a handler's schema; sent to the browser as a 400. */
export class InputError extends Error {
  constructor(readonly issues: readonly StandardSchemaV1.Issue[]) {
    super(`Invalid input: ${issues.map(formatIssue).join("; ")}`);
  }
}

function formatIssue(issue: StandardSchemaV1.Issue) {
  const path = issue.path?.map(p => (typeof p === "object" ? p.key : p)).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Runs a handler's schema, if it has one, and returns the parsed input. */
export async function parseInput(h: Handler, input: unknown) {
  const schema = h[SCHEMA];
  if(!schema) return input;
  const result = await schema["~standard"].validate(input);
  if(result.issues) throw new InputError(result.issues);
  return result.value;
}

/** Helper for handlers that need the resource: throws a clear error on pages. */
export function requireResource<Attr = any, Props = any>(ctx: HandlerContext<Attr, Props>) {
  if(!ctx.resource) throw new Error("This handler needs a resource and was called from a page.");
  return ctx.resource;
}
