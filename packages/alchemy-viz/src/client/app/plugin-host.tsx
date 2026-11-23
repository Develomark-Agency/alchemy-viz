/**
 * Loads a plugin view or page module on demand and renders it inside an
 * error boundary, so a broken custom view can't take down the panel.
 */
import { Component, type ReactNode, useEffect, useState } from "react";
import { pages, views } from "virtual:alchemy-viz/registry";
import type { ResourceInfo, StackInfo } from "../../types.ts";
import { Banner, Code, Loading } from "../../ui/index.ts";
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
      <div className="av-stack" style={{ gap: 8 }}>
        <Banner tone="danger">This view crashed: {this.state.error.message}</Banner>
        {this.state.error.stack && <Code>{this.state.error.stack}</Code>}
      </div>
    );
  }
}

function useModule<T>(load: (() => Promise<{ default: T }>) | undefined, key: string) {
  const [state, setState] = useState<{ key: string, def?: T, error?: Error }>();
  useEffect(() => {
    if(!load) return;
    let cancelled = false;
    load().then(
      m => !cancelled && setState({ key, def: m.default }),
      error => !cancelled && setState({ key, error })
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state?.key === key ? state : undefined;
}

export function ViewHost({ viewId, resource, stack }: { viewId: string, resource: ResourceInfo, stack: StackInfo }) {
  const entry = views.find(v => v.id === viewId);
  const mod = useModule<ViewDefinition>(entry?.load, viewId);
  if(!entry) return <Banner tone="danger">Unknown view {viewId}</Banner>;
  if(!mod) return <Loading />;
  if(mod.error) return <Banner tone="danger">Couldn't load view: {mod.error.message}</Banner>;
  if(mod.def?.__alchemyViz !== "view") {
    return <Banner tone="danger">The view module must `export default defineView(...)` from "alchemy-viz/client".</Banner>;
  }
  const View = mod.def.component;
  return (
    <Boundary resetKey={`${viewId}:${resource.fqn}`}>
      <View key={resource.fqn} resource={resource} stack={stack} api={makeApi({ fqn: resource.fqn }) as never} />
    </Boundary>
  );
}

export function PageHost({ pageId, stack }: { pageId: string, stack: StackInfo }) {
  const entry = pages.find(p => p.id === pageId);
  const mod = useModule<PageDefinition>(entry?.load, pageId);
  if(!entry) return <Banner tone="danger">Unknown page {pageId}</Banner>;
  if(!mod) return <Loading />;
  if(mod.error) return <Banner tone="danger">Couldn't load page: {mod.error.message}</Banner>;
  if(mod.def?.__alchemyViz !== "page") {
    return <Banner tone="danger">The page module must `export default definePage(...)` from "alchemy-viz/client".</Banner>;
  }
  const PageView = mod.def.component;
  return (
    <Boundary resetKey={pageId}>
      <PageView stack={stack} api={makeApi({ page: pageId }) as never} />
    </Boundary>
  );
}
