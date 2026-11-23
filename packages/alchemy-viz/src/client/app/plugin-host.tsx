/**
 * Loads a plugin view or page module on demand and renders it inside an
 * error boundary, so a broken custom view can't take down the panel.
 */
import { useQuery } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { pages, views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { Banner, CodeBlock, Loading } from "../../ui/index.ts";
import { makeApi, type PageDefinition, type ViewDefinition } from "../index.tsx";

class Boundary extends Component<{ children: ReactNode, resetKey: string }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if(prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if(!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col gap-2">
        <Banner tone="danger">This view crashed: {this.state.error.message}</Banner>
        {this.state.error.stack && <CodeBlock code={this.state.error.stack} />}
      </div>
    );
  }
}

function useModule<T>(id: string, load: (() => Promise<{ default: T }>) | undefined) {
  return useQuery({
    queryKey: ["module", id],
    queryFn: async () => (await load!()).default,
    enabled: !!load,
    staleTime: Infinity,
    retry: false
  });
}

export function ViewHost({ viewId, resource, stack }: { viewId: string, resource: ResourceInfo, stack: StackInfo }) {
  const entry = views.find(v => v.id === viewId);
  const mod = useModule<ViewDefinition>(viewId, entry?.load);
  if(!entry) return <Banner tone="danger">Unknown view {viewId}</Banner>;
  if(mod.error) return <Banner tone="danger">Couldn't load view: {mod.error.message}</Banner>;
  if(!mod.data) return <Loading />;
  if(mod.data.__alchemyViz !== "view") {
    return <Banner tone="danger">The view module must `export default defineView(...)` from "alchemy-viz/client".</Banner>;
  }
  const View = mod.data.component;
  return (
    <Boundary resetKey={`${viewId}:${resource.fqn}`}>
      <View key={resource.fqn} resource={resource} stack={stack} api={makeApi({ fqn: resource.fqn }) as never} />
    </Boundary>
  );
}

export function PageHost({ pageId, stack }: { pageId: string, stack: StackInfo }) {
  const entry = pages.find(p => p.id === pageId);
  const mod = useModule<PageDefinition>(pageId, entry?.load);
  if(!entry) return <Banner tone="danger">Unknown page {pageId}</Banner>;
  if(mod.error) return <Banner tone="danger">Couldn't load page: {mod.error.message}</Banner>;
  if(!mod.data) return <Loading />;
  if(mod.data.__alchemyViz !== "page") {
    return <Banner tone="danger">The page module must `export default definePage(...)` from "alchemy-viz/client".</Banner>;
  }
  const PageView = mod.data.component;
  return (
    <Boundary resetKey={pageId}>
      <PageView stack={stack} api={makeApi({ page: pageId }) as never} />
    </Boundary>
  );
}
