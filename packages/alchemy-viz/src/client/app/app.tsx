import { Banner, EmptyState, Loading, Page, Panel } from "../../ui/index.ts";
import { NavigateContext } from "../index.tsx";
import { LogsPanel } from "./logs-panel.tsx";
import { OverviewPage } from "./overview-page.tsx";
import { PageHost } from "./plugin-host.tsx";
import { ResourcePage } from "./resource-page.tsx";
import { useRouter } from "./router.ts";
import { Sidebar } from "./sidebar.tsx";
import { useStack } from "./use-stack.ts";

export function App() {
  const { route, navigate } = useRouter();
  const { data, error, refresh, refreshing, setStage } = useStack();

  function content() {
    if(!data) {
      return error ? (
        <Panel>
          <EmptyState title="Couldn't read the stack">{error.message}</EmptyState>
        </Panel>
      ) : (
        <Loading label="Reading stack state…" />
      );
    }
    const { stack } = data;
    switch(route.name) {
      case "overview":
        return <OverviewPage stack={stack} navigate={navigate} />;
      case "logs":
        return (
          <Page title="Logs" subtitle="Everything the current alchemy dev run logged, newest at the bottom.">
            <Panel flush>
              <LogsPanel showSource />
            </Panel>
          </Page>
        );
      case "resource":
        return <ResourcePage stack={stack} fqn={route.fqn} meta={data.meta[route.fqn]} tab={route.tab} navigate={navigate} />;
      case "page": {
        const page = data.pages.find(p => p.route === route.route);
        return page ? (
          <Page title={page.title}>
            <PageHost pageId={page.id} stack={stack} />
          </Page>
        ) : (
          <Panel>
            <EmptyState title="Page not found" />
          </Panel>
        );
      }
      default:
        return (
          <Panel>
            <EmptyState title="Page not found" />
          </Panel>
        );
    }
  }

  return (
    <NavigateContext.Provider value={navigate}>
      <div className="viz-shell">
        <Sidebar
          data={data}
          route={route}
          navigate={navigate}
          onStage={setStage}
          onRefresh={refresh}
          refreshing={refreshing}
        />
        <main className="viz-main">
          {data && error && <Banner tone="warn">Lost contact with the stack state: {error.message}</Banner>}
          {content()}
        </main>
      </div>
    </NavigateContext.Provider>
  );
}
