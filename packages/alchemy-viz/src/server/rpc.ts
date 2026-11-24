/**
 * Dispatches a call from a view or page to its server module's handler.
 *
 * Server modules are imported natively (not through Vite) and re-imported
 * when the file changes, so editing a handler takes effect on the next call.
 * Only the server module itself reloads; modules it imports keep their
 * first version.
 */
import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { type HandlerContext, parseInput, type ServerDefinition } from "./define.ts";

const loaded = new Map<string, number>();

export async function loadServerModule(file: string): Promise<ServerDefinition> {
  const version = statSync(file).mtimeMs;
  const changed = loaded.has(file) && loaded.get(file) !== version;
  loaded.set(file, version);
  const url = pathToFileURL(file).href;
  let mod;
  if(process.versions.bun) {
    // Bun caches modules by path and ignores a `?v=` query, so a changed
    // file is dropped from the cache before it's imported again.
    if(changed) delete require.cache[file];
    mod = await import(url);
  } else {
    // Node caches by URL, query included.
    mod = await import(`${url}?v=${version}`);
  }
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
