import { definePage } from "alchemy-viz/client";
import { Button, DataTable, ErrorBanner, Input, Panel, Row, Stack } from "alchemy-viz/ui";
import { useState } from "react";
import type server from "./server.ts";

export default definePage<typeof server>(({ api }) => {
  const [count, setCount] = useState(20);
  const send = api.send.useMutation();
  return (
    <Stack gap={16}>
      <Panel title="Generate traffic">
        <Row gap={8}>
          <Input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            style={{ width: 100 }}
            aria-label="Request count"
          />
          <Button variant="primary" loading={send.pending} onClick={() => send.run({ count })}>
            Send {count} requests
          </Button>
        </Row>
      </Panel>
      <ErrorBanner error={send.error} />
      {send.data && (
        <Panel title="Responses" flush>
          <DataTable rows={send.data} rowKey={r => r.route} columns={[{ key: "route", header: "Route" }, { key: "count", header: "Requests" }]} />
        </Panel>
      )}
    </Stack>
  );
});
