declare module "virtual:alchemy-viz/registry" {
  import type { PageDefinition, ViewDefinition } from "../index.tsx";
  export const views: Array<{
    id: string,
    plugin: string,
    title: string,
    types: Array<string | RegExp>,
    load: () => Promise<{ default: ViewDefinition }>
  }>;
  export const pages: Array<{
    id: string,
    plugin: string,
    title: string,
    route: string,
    load: () => Promise<{ default: PageDefinition }>
  }>;
}
