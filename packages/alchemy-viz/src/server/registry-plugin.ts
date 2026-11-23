/**
 * Vite plugins that turn the resolved plugin config into what the browser
 * needs:
 *
 * - `virtual:alchemy-viz/registry`: every view and page, each lazily
 *   imported through `/@fs/`, so Vite compiles and hot-reloads project and
 *   package views alike.
 * - The shell stylesheet gets one `@source` line per plugin directory, so
 *   Tailwind generates the classes those views use wherever they live.
 */
import { dirname } from "node:path";
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
      const viewLines = views.map(v => `  { id: ${JSON.stringify(v.id)}, plugin: ${JSON.stringify(v.plugin)}, title: ${JSON.stringify(v.title)}, types: [${v.types.map(pattern).join(", ")}], load: () => import(${JSON.stringify(fsUrl(v.view))}) },`);
      const pageLines = pages.map(p => `  { id: ${JSON.stringify(p.id)}, plugin: ${JSON.stringify(p.plugin)}, title: ${JSON.stringify(p.title)}, route: ${JSON.stringify(p.route)}, load: () => import(${JSON.stringify(fsUrl(p.view))}) },`);
      return `export const views = [\n${viewLines.join("\n")}\n];\nexport const pages = [\n${pageLines.join("\n")}\n];\n`;
    }
  };
}

export function tailwindSourcesPlugin(stylesheet: string, views: ResolvedView[], pages: ResolvedPage[]): Plugin {
  const dirs = [...new Set([...views, ...pages].map(entry => dirname(entry.view)))];
  const lines = dirs.map(dir => `@source ${JSON.stringify(dir)};`).join("\n");
  return {
    name: "alchemy-viz:tailwind-sources",
    // Runs before Tailwind's own transform, which reads the @source lines.
    enforce: "pre",
    transform(code, id) {
      if(id.split("?")[0] !== stylesheet) return;
      return { code: `${code}\n${lines}\n`, map: null };
    }
  };
}
