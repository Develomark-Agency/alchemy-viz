import { definePage } from "alchemy-viz/client";
import { Button, DataTable, ErrorBanner, Field, FieldLabel, Input, Panel, toast } from "alchemy-viz/ui";
import { Send } from "lucide-react";
import { useState } from "react";
import type server from "./server.ts";

export default definePage<typeof server>(({ api }) => {
  const [count, setCount] = useState("20");
  const send = api.send.useMutation({ onSuccess: (_, input) => toast(`Sent ${input.count} requests`) });

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Panel title="Generate traffic" className="w-80">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            send.mutate({ count: Number(count) });
          }}
        >
          <Field className="w-32">
            <FieldLabel>Requests</FieldLabel>
            <Input type="number" min={1} max={200} value={count} onValueChange={setCount} />
          </Field>
          <Button variant="primary" type="button" onClick={() => send.mutateAsync({ count: Number(count) }).catch(() => {})}>
            <Send />
            Send
          </Button>
        </form>
      </Panel>
      <ErrorBanner error={send.error} className="w-full" />
      {send.data && (
        <Panel title="Responses" flush className="w-[420px] max-w-full">
          <DataTable
            rows={send.data}
            getRowId={r => r.route}
            columns={[
              { id: "route", header: "Route", size: 300, cell: r => <span className="font-mono text-xs">{r.route}</span> },
              { id: "count", header: "Requests", size: 120, align: "right" }
            ]}
          />
        </Panel>
      )}
    </div>
  );
});
