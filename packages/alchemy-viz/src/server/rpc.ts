/**
 * Dispatches a call from a view or page to its server module's handler.
 *
 * Server modules are imported natively (not through Vite) and re-imported
 * when the file changes, so editing a handler takes effect on the next call.
 */
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type HandlerContext, parseInput, type ServerDefinition } from "./define.ts";

export async function loadServerModule(file: string): Promise<ServerDefinition> {
  const version = statSync(file).mtimeMs;
  const mod = await import(`${pathToFileURL(file).href}?v=${version}`);
  const def = mod.default;
  if(!def || def.__alchemyViz !== "server") {
    throw new Error(`${file} must \`export default defineServer({...})\` from "alchemy-viz/server".`);
  }
  return def;
}

export async function callHandler(file: string, name: string, input: unknown, ctx: HandlerContext): Promise<unknown> {
  const def = await loadServerModule(file);
  const h = def.handlers[name];
  if(typeof h !== "function") {
    throw new Error(`No handler '${name}' in ${file}. Available: ${Object.keys(def.handlers).join(", ")}`);
  }
  const result = await h(await parseInput(h, input), ctx);
  const Effect = await ctx.importFromProject("effect/Effect");
  return Effect.isEffect(result) ? Effect.runPromise(result) : result;
}
