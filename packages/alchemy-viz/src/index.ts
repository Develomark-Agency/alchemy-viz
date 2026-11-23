export type {
  ModuleRef,
  PageEntry,
  PluginContext,
  ResourceInfo,
  StackInfo,
  ViewEntry,
  VizConfig,
  VizPlugin
} from "./types.ts";
import type { VizConfig, VizPlugin } from "./types.ts";

/** Typed identity helper for `alchemy-viz.config.ts`. */
export function defineConfig(config: VizConfig): VizConfig {
  return config;
}

/**
 * Typed identity helper for a plugin. Relative `server`/`view` paths in a
 * plugin defined inside the config file resolve against the config file.
 * Packaged plugins should pass absolute paths or URLs
 * (`new URL("./view.tsx", import.meta.url)`).
 */
export function definePlugin(plugin: VizPlugin): VizPlugin {
  return plugin;
}
