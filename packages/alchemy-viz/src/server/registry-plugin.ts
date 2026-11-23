/**
 * Vite plugin that turns the resolved plugin config into a browser module:
 *
 *   import { views, pages } from "virtual:alchemy-viz/registry";
 *
 * Each entry lazily imports its view file through `/@fs/`, so Vite compiles
 * and hot-reloads project and package views alike.
 */
import type { Plugin } from "vite";
import type { ResolvedPage, ResolvedView } from "./project.ts";

const ID = "virtual:alchemy-viz/registry";
const RESOLVED = `\0${ID}`;

function fsUrl(file: string) {
  return `/@fs${file.startsWith("/") ? "" : "/"}${file}`;
}

function pattern(t: string | RegExp) {
  return typeof t === "string" ? JSON.stringify(t) : `new RegExp(${JSON.stringify(t.source)}, ${JSON.stringify(t.flags)})`;
}

export function registryPlugin(views: ResolvedView[], pages: ResolvedPage[]): Plugin {
  return {
    name: "alchemy-viz:registry",
    resolveId: id => (id === ID ? RESOLVED : undefined),
    load(id) {
      if(id !== RESOLVED) return;
      const viewLines = views.map(
        v => `  { id: ${JSON.stringify(v.id)}, plugin: ${JSON.stringify(v.plugin)}, title: ${JSON.stringify(v.title)}, types: [${v.types.map(pattern).join(", ")}], load: () => import(${JSON.stringify(fsUrl(v.view))}) },`
      );
      const pageLines = pages.map(
        p => `  { id: ${JSON.stringify(p.id)}, plugin: ${JSON.stringify(p.plugin)}, title: ${JSON.stringify(p.title)}, route: ${JSON.stringify(p.route)}, load: () => import(${JSON.stringify(fsUrl(p.view))}) },`
      );
      return `export const views = [\n${viewLines.join("\n")}\n];\nexport const pages = [\n${pageLines.join("\n")}\n];\n`;
    }
  };
}
