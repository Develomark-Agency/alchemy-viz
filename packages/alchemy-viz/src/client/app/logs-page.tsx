import { Page, Panel } from "../../ui/index.ts";
import { LogsPanel } from "./logs-panel.tsx";

export function LogsPage() {
  return (
    <Page title="Logs" subtitle="Everything the current alchemy dev run logged, newest at the bottom.">
      <Panel flush>
        <LogsPanel showSource />
      </Panel>
    </Page>
  );
}
