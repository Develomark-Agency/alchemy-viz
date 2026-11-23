/**
 * Shared types: what the server knows about a stack and its resources, and
 * the shape of plugins. Everything here is plain JSON so it can cross the
 * server/browser boundary unchanged.
 */

/** One resource as recorded in the stack's state store. */
export interface ResourceInfo<Attr = any, Props = any> {
  /** Fully qualified name (namespace path + logical id). Unique within a stage. */
  fqn: string,
  logicalId: string,
  /** Resource type string, e.g. `Cloudflare.KV.Namespace` or `Acme.FeatureFlags`. */
  type: string,
  /** Lifecycle status from state (`created`, `updated`, `creating`, ...). */
  status: string,
  /** `local` when the resource runs in a local simulator, `live` when pinned to the cloud. */
  mode: "local" | "live" | undefined,
  props: Props,
  attr: Attr,
  /** Binding payloads attached to this resource (e.g. a Worker's env bindings). */
  bindings: Array<{ sid: string, data: unknown }>,
  /** FQNs of resources that depend on this one. */
  downstream: string[],
  /** FQNs of resources this one depends on (derived from `downstream`). */
  upstream: string[]
}

export interface StackInfo {
  name: string,
  stage: string,
  /** Every stage the state store knows for this stack. */
  stages: string[],
  /** Absolute project root (the directory holding the config). */
  root: string,
  output: unknown,
  resources: ResourceInfo[]
}

/** A file reference: absolute path, path relative to the config file, or a `file:` URL. */
export type ModuleRef = string | URL;

export interface ViewEntry {
  /** Resource type(s) this view renders. A RegExp matches by pattern. */
  type: string | RegExp | Array<string | RegExp>,
  /** Module whose default export is `defineServer({...})`. Optional for read-only views. */
  server?: ModuleRef,
  /** Module whose default export is `defineView(...)`. */
  view: ModuleRef,
  /** Tab label. Defaults to "Explore". */
  title?: string
}

export interface PageEntry {
  /** URL segment under `/pages/`, e.g. `seed`. */
  route: string,
  /** Sidebar label. */
  title: string,
  server?: ModuleRef,
  view: ModuleRef
}

export interface PluginContext {
  /** Absolute project root. */
  root: string,
  /** Resolve a module from the user's project, so plugins use the project's copy of a dependency. */
  importFromProject<T = any>(specifier: string, options?: { via?: string }): Promise<T>
}

export interface VizPlugin {
  name: string,
  views?: ViewEntry[],
  pages?: PageEntry[],
  /** URL of the resource in its provider's own dashboard, shown when it can't be explored locally. */
  link?(resource: ResourceInfo): string | undefined,
  /**
   * Whether this plugin's view can show the resource here. Return `false`
   * for resources that only exist in the cloud; the panel then shows a
   * link instead of the view.
   */
  isLocal?(resource: ResourceInfo): boolean,
  /** Runs once at startup. May return a teardown function. */
  setup?(ctx: PluginContext): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>
}

export interface VizConfig {
  /** Stack entrypoint, relative to the config file. @default "./alchemy.run.ts" */
  stack?: string,
  /** Stage to explore. @default $ALCHEMY_STAGE or `dev_$USER` (what `alchemy dev` uses). */
  stage?: string,
  /** Dashboard port. @default 4700, or the next free port when that one is taken */
  port?: number,
  plugins?: VizPlugin[]
}
