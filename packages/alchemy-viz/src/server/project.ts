/**
 * Loading the user's config and resolving modules from their project.
 *
 * alchemy-viz never imports `alchemy` or `effect` from its own
 * node_modules: it uses the project's copies, so Effect service tags and
 * Alchemy internals are the exact instances the stack was built with.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ModuleRef, PageEntry, ViewEntry, VizConfig, VizPlugin } from "../types.ts";

export const CONFIG_FILES = ["alchemy-viz.config.ts", "alchemy-viz.config.js", "alchemy-viz.config.mjs"];

export function makeImportFromProject(root: string) {
  return async <T = any>(specifier: string, options?: { via?: string }): Promise<T> => {
    // `via` resolves a transitive dependency through a direct one, e.g.
    // `@alchemy.run/cloudflare-runtime` via `@alchemy.run/cloudflare`.
    const base = options?.via
      ? dirname(Bun.resolveSync(`${options.via}/package.json`, root))
      : root;
    return import(Bun.resolveSync(specifier, base)) as Promise<T>;
  };
}

export interface ResolvedView {
  id: string,
  plugin: string,
  types: Array<string | RegExp>,
  title: string,
  server?: string,
  view: string
}

export interface ResolvedPage {
  id: string,
  plugin: string,
  route: string,
  title: string,
  server?: string,
  view: string
}

export interface LoadedConfig {
  root: string,
  configFile: string | undefined,
  entrypoint: string,
  stage: string,
  port: number,
  plugins: VizPlugin[],
  views: ResolvedView[],
  pages: ResolvedPage[]
}

function toPath(ref: ModuleRef, base: string) {
  if(ref instanceof URL) return fileURLToPath(ref);
  if(ref.startsWith("file:")) return fileURLToPath(ref);
  return isAbsolute(ref) ? ref : resolve(base, ref);
}

function defaultStage() {
  return process.env.ALCHEMY_STAGE ?? `dev_${process.env.USER ?? "unknown"}`;
}

export async function loadConfig(options: {
  cwd: string,
  config?: string,
  stage?: string,
  port?: number,
  builtins: VizPlugin[]
}): Promise<LoadedConfig> {
  const configFile = options.config
    ? resolve(options.cwd, options.config)
    : CONFIG_FILES.map(f => resolve(options.cwd, f)).find(f => existsSync(f));
  if(options.config && !existsSync(configFile!)) {
    throw new Error(`Config file not found: ${configFile}`);
  }
  const root = configFile ? dirname(configFile) : options.cwd;
  const config: VizConfig = configFile
    ? ((await import(pathToFileURL(configFile).href)).default ?? {})
    : {};

  // A config without plugins gets the built-ins; listing plugins replaces
  // them, so a project can drop or reorder them.
  const plugins = config.plugins ?? options.builtins;

  const views: ResolvedView[] = [];
  const pages: ResolvedPage[] = [];
  for(const plugin of plugins) {
    plugin.views?.forEach((entry: ViewEntry, i) => {
      views.push({
        id: `${plugin.name}:view:${i}`,
        plugin: plugin.name,
        types: Array.isArray(entry.type) ? entry.type : [entry.type],
        title: entry.title ?? "Explore",
        server: entry.server ? toPath(entry.server, root) : undefined,
        view: toPath(entry.view, root)
      });
    });
    plugin.pages?.forEach((entry: PageEntry, i) => {
      pages.push({
        id: `${plugin.name}:page:${i}`,
        plugin: plugin.name,
        route: entry.route,
        title: entry.title,
        server: entry.server ? toPath(entry.server, root) : undefined,
        view: toPath(entry.view, root)
      });
    });
  }
  for(const entry of [...views, ...pages]) {
    for(const file of [entry.view, entry.server]) {
      if(file && !existsSync(file)) {
        throw new Error(`Plugin '${entry.plugin}' points at a missing file: ${file}`);
      }
    }
  }

  return {
    root,
    configFile,
    entrypoint: resolve(root, config.stack ?? "./alchemy.run.ts"),
    stage: options.stage ?? config.stage ?? defaultStage(),
    port: options.port ?? config.port ?? 4321,
    plugins,
    views,
    pages
  };
}

/** First view whose type pattern matches. Earlier plugins win. */
export function viewFor(views: ResolvedView[], type: string) {
  return views.find(v => v.types.some(t => (typeof t === "string" ? t === type : t.test(type))));
}
