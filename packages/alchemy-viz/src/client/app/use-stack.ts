import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
import type { StackInfo } from "../../types.ts";

export interface ResourceMeta {
  /** Registry ids of the plugin views for this resource, one tab each. */
  viewIds: string[],
  /** The resource in its provider's own dashboard. */
  link?: string,
  /** False when the view can't show it here (cloud-only). */
  local: boolean
}

export interface StackResponse {
  stack: StackInfo,
  meta: Record<string, ResourceMeta>,
  pages: Array<{ id: string, route: string, title: string, plugin: string }>
}

async function fetchStack(stage: string | undefined, fresh: boolean): Promise<StackResponse> {
  const params = new URLSearchParams();
  if(stage) params.set("stage", stage);
  if(fresh) params.set("fresh", "1");
  const res = await fetch(`/__viz/api/stack?${params}`);
  const body = await res.json();
  if(!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const StageContext = createContext<{ stage: string | undefined, setStage: (stage: string) => void }>({
  stage: undefined,
  setStage: () => {}
});

/** The stack's resources and plugin metadata, polled for state changes. */
export function useStack() {
  const { stage } = useContext(StageContext);
  return useQuery({
    queryKey: ["stack", stage ?? null],
    queryFn: () => fetchStack(stage, false),
    refetchInterval: 4_000,
    placeholderData: previous => previous
  });
}

/** Re-reads state now and refetches every view's data. */
export function useRefresh() {
  const client = useQueryClient();
  const { stage } = useContext(StageContext);
  return useCallback(async () => {
    const fresh = await fetchStack(stage, true);
    client.setQueryData(["stack", stage ?? null], fresh);
    await client.invalidateQueries({ queryKey: ["rpc"] });
  }, [client, stage]);
}
