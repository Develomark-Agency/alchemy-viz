import { defineConfig, definePlugin } from "alchemy-viz";
import { cloudflare } from "alchemy-viz/cloudflare";

/**
 * A project-local plugin: a page for the one-off `Acme.FeatureFlags`
 * resource, and a custom "Traffic" page. Relative paths resolve against
 * this file.
 */
const acme = definePlugin({
  name: "acme",
  views: [
    {
      type: "Acme.FeatureFlags",
      title: "Flags",
      server: "./viz/feature-flags/server.ts",
      view: "./viz/feature-flags/view.tsx"
    }
  ],
  pages: [
    {
      route: "traffic",
      title: "Traffic",
      server: "./viz/traffic/server.ts",
      view: "./viz/traffic/page.tsx"
    }
  ]
});

export default defineConfig({
  stack: "./alchemy.run.ts",
  plugins: [cloudflare(), acme]
});
