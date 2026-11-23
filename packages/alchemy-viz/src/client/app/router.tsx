import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { CustomPage } from "./custom-page.tsx";
import { LogsPage } from "./logs-page.tsx";
import { NotFound } from "./not-found.tsx";
import { OverviewPage } from "./overview-page.tsx";
import { ResourcePage } from "./resource-page.tsx";
import { Shell } from "./shell.tsx";

// Views keep their own state in the query string (see useUrlState), so
// search params pass through untouched.
type Search = Record<string, unknown>;

const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: NotFound
});

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage });

const logsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/logs", component: LogsPage });

export const resourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/r/$fqn",
  validateSearch: (search: Search): Search & { tab?: string } => search,
  component: ResourcePage
});

export const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pages/$",
  component: CustomPage
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([overviewRoute, logsRoute, resourceRoute, pageRoute]),
  defaultPreload: false,
  scrollRestoration: true
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
