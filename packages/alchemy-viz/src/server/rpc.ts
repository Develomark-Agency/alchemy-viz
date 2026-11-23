/**
 * Dispatches a call from a view or page to its server module's handler.
 *
 * Server modules are imported natively (not through Vite) and re-imported
 * when the file changes, so editing a handler takes effect on the next call.
 */
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { ServerDefinition } from "./define.ts";
import type { HandlerContext } from "./define.ts";

export async function loadServerModule(file: string): Promise<ServerDefinition> {
  const version = statSync(file).mtimeMs;
  const mod = await import(`${pathToFileURL(file).href}?v=${version}`);
  const def = mod.default;
  if(!def || def.__alchemyViz !== "server") {
    throw new Error(`${file} must \`export default defineServer({...})\` from "alchemy-viz/server".`);
  }
  return def;
}

function isEffect(value: unknown): boolean {
  return typeof value === "object" &&
  value !== null &&
  Object.getOwnPropertySymbols(value).some(s => s.description?.startsWith("effect/Effect") || s.description === "~effect/Effect");
}

export async function callHandler(
  file: string,
  name: string,
  input: unknown,
  ctx: HandlerContext): Promise<unknown> {
  const def = await loadServerModule(file);
  const handler = def.handlers[name];
  if(typeof handler !== "function") {
    throw new Error(`No handler '${name}' in ${file}. Available: ${Object.keys(def.handlers).join(", ")}`);
  }
  const result = await handler(input, ctx);
  if(isEffect(result)) {
    const Effect = await ctx.importFromProject("effect/Effect");
    return Effect.runPromise(result);
  }
  return result;
}
