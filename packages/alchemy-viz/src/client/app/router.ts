import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "overview" }
  | { name: "logs" }
  | { name: "resource", fqn: string, tab?: string }
  | { name: "page", route: string }
  | { name: "not-found" };

export function parseRoute(pathname: string, search: string): Route {
  if(pathname === "/" || pathname === "") return { name: "overview" };
  if(pathname === "/logs") return { name: "logs" };
  const r = pathname.match(/^\/r\/(.+)$/);
  if(r) return { name: "resource", fqn: decodeURIComponent(r[1]!), tab: new URLSearchParams(search).get("tab") ?? undefined };
  const p = pathname.match(/^\/pages\/(.+)$/);
  if(p) return { name: "page", route: decodeURIComponent(p[1]!) };
  return { name: "not-found" };
}

/** Minimal pushState router; the dashboard has a handful of routes. */
export function useRouter() {
  function read() {
    return parseRoute(window.location.pathname, window.location.search);
  }
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    function onPop() {
      return setRoute(read());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if(options?.replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setRoute(read());
    if(!options?.replace) window.scrollTo(0, 0);
  }, []);
  return { route, navigate };
}
