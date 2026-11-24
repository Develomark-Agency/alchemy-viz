/**
 * Everything the first paint needs, fetched before React renders anything.
 *
 * Without it the page appears in stages: the bar without its project switcher
 * or run button, then the page's content, then the graph resizing to its
 * layout, then the view's code. Each stage moves what the one before drew.
 * So the first render waits (briefly) for the lot, and shows a finished page.
 * Past `budget` it renders anyway, and the loading states take over.
 */
import type { QueryClient } from "@tanstack/react-query";
import { pages, views } from "virtual:alchemy-viz/registry";
import { graphLayoutQuery } from "./graph.tsx";
import { moduleQuery } from "./plugin-host.tsx";
import { fetchRun, runKey } from "./run-controls.tsx";
import { fetchStack, type StackResponse, stackKey } from "./use-stack.ts";

declare global {
  interface Window {
    /** Requests index.html started while the modules were still downloading. */
    __viz?: { stack?: Promise<Response | undefined>, run?: Promise<Response | undefined> }
  }
}

// Each early response is used once; later reads go to the server.
const early = window.__viz;
delete window.__viz;

async function readEarly<T>(response: Promise<Response | undefined> | undefined, fallback: () => Promise<T>): Promise<T> {
  try {
    const res = await response;
    if(res?.ok) return await res.json();
  } catch {}
  return fallback();
}

// Text set in a font that arrives late is laid out twice: once in the fallback, once in the font.
const fonts = ["400 13px \"IBM Plex Sans Variable\"", "500 13px \"IBM Plex Sans Variable\"", "400 12px \"IBM Plex Mono\"", "500 12px \"IBM Plex Mono\""];

/** The code of the views and page the address is showing, so they render with the page instead of after it. */
function preloadCurrentModules(client: QueryClient, stack: StackResponse) {
  const [, section, rest] = location.pathname.split("/");
  const ids: string[] = [];
  if(section === "r" && rest) ids.push(...stack.meta[decodeURIComponent(rest)]?.viewIds ?? []);
  if(section === "pages") {
    const route = location.pathname.split("/").slice(2).map(decodeURIComponent).join("/");
    const page = stack.pages.find(p => p.route === route);
    if(page) ids.push(page.id);
  }
  return Promise.all(ids.map(id => {
    const entry = views.find(v => v.id === id) ?? pages.find(p => p.id === id);
    return client.prefetchQuery(moduleQuery(id, entry?.load));
  }));
}

export async function bootstrap(client: QueryClient, budget = 800) {
  const stack = (async () => {
    const data = await client.fetchQuery({
      queryKey: stackKey(undefined),
      queryFn: () => readEarly(early?.stack, () => fetchStack(undefined, false))
    });
    await Promise.all([
      preloadCurrentModules(client, data),
      // The overview's graph is sized by its layout.
      data.stack.resources.length > 0 && location.pathname === "/" ? client.prefetchQuery(graphLayoutQuery(data.stack.resources)) : undefined
    ]);
  })();
  const everything = Promise.all([
    stack,
    client.prefetchQuery({ queryKey: runKey, queryFn: () => readEarly(early?.run, fetchRun) }),
    Promise.all(fonts.map(font => document.fonts.load(font)))
  ]);
  // Failures are left to the components' own error states.
  await Promise.race([everything.catch(() => {}), new Promise(done => setTimeout(done, budget))]);
}

/** Once the page is up, fetch the code of every view and page and lay out the graph, so going to one is instant too. */
export function warmModules(client: QueryClient) {
  function warm() {
    for(const entry of [...views, ...pages]) void client.prefetchQuery(moduleQuery(entry.id, entry.load));
    const resources = client.getQueryData<StackResponse>(stackKey(undefined))?.stack.resources;
    if(resources?.length) void client.prefetchQuery(graphLayoutQuery(resources));
  }
  if("requestIdleCallback" in window) requestIdleCallback(warm);
  else setTimeout(warm, 500);
}
