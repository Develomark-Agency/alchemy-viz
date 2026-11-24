/**
 * Builds `dist/`: every module in `src/` compiled to its own `.mjs` (with
 * a `.d.mts`) at the same relative path, so Node can run the CLI and the
 * plugin indexes can point at their views and server modules by URL.
 *
 * Nothing is bundled in. Dependencies stay imports, so the shell and every
 * view share one copy of React and friends, and `alchemy`/`effect` come
 * from the user's project. Stylesheets and the shell's `index.html` are
 * copied across for Vite to serve.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { defineConfig } from "tsdown";

const ASSETS = /\.(css|html)$/;

function copyAssets(from: string, to: string) {
  for(const entry of readdirSync(from, { recursive: true, withFileTypes: true })) {
    if(!entry.isFile() || !ASSETS.test(entry.name)) continue;
    const source = join(entry.parentPath, entry.name);
    const target = join(to, relative(from, source));
    mkdirSync(dirname(target), { recursive: true });
    if(entry.name.endsWith(".html")) {
      // The shell's page loads its entry module by file name.
      writeFileSync(target, readFileSync(source, "utf8").replace(/(src="[^"]+)\.tsx?"/g, "$1.mjs\""));
    } else {
      copyFileSync(source, target);
    }
  }
}

export default defineConfig({
  entry: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.d.ts"],
  root: "src",
  unbundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  dts: true,
  // Resolved by Vite at runtime: the shell's stylesheet (Tailwind compiles
  // it) and the plugin registry, a virtual module.
  deps: { neverBundle: [/\.css$/, /^virtual:/] },
  sourcemap: true,
  publint: true,
  hooks: {
    // Before the build's own checks (publint) look for the files.
    "build:before": () => copyAssets("src", "dist")
  }
});
