import { useCallback, useEffect, useRef, useState } from "react";
import type { StackInfo } from "../../types.ts";
import { invalidate } from "../index.tsx";

export interface ResourceMeta {
  /** Registry id of the plugin view for this resource's type. */
  viewId?: string,
  /** External dashboard URL. */
  link?: string,
  /** False when the view can't show it locally (cloud-only). */
  local: boolean
}

export interface StackResponse {
  stack: StackInfo,
  meta: Record<string, ResourceMeta>,
  pages: Array<{ id: string, route: string, title: string, plugin: string }>
}

const POLL_MS = 4000;

/** Loads the stack, polls for state changes, and exposes a manual refresh. */
export function useStack() {
  const [data, setData] = useState<StackResponse>();
  const [error, setError] = useState<Error>();
  const [refreshing, setRefreshing] = useState(false);
  const [stage, setStage] = useState<string>();
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const load = useCallback(async (fresh = false) => {
    const params = new URLSearchParams();
    if(stageRef.current) params.set("stage", stageRef.current);
    if(fresh) params.set("fresh", "1");
    const res = await fetch(`/__viz/api/stack?${params}`);
    const body = await res.json();
    if(!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body as StackResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const next = await load();
        if(cancelled) return;
        // Only re-render when state actually changed.
        setData(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        setError(undefined);
      } catch (e) {
        if(!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
      if(!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, stage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await load(true));
      setError(undefined);
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { data, error, refresh, refreshing, setStage };
}
