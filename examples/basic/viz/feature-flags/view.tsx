import { defineView } from "alchemy-viz/client";
import { ActionButton, Badge, Button, DataTable, ErrorBanner, Input, Panel, Row, Toggle } from "alchemy-viz/ui";
import { useState } from "react";
import type server from "./server.ts";

export default defineView<typeof server>(({ resource, api }) => {
  const flags = api.flags.useQuery();
  const set = api.set.useMutation();
  const remove = api.remove.useMutation();
  const [name, setName] = useState("");

  async function add() {
    if(!name.trim()) return;
    await set.run({ name: name.trim(), enabled: false });
    setName("");
  }

  return (
    <Panel
      title="Feature flags"
      actions={<span className="av-muted av-mono" style={{ fontSize: 12 }}>{resource.attr.file}</span>}
      flush
    >
      <ErrorBanner error={set.error ?? remove.error} />
      <DataTable
        rows={flags.data}
        loading={flags.loading}
        error={flags.error}
        rowKey={f => f.name}
        empty="No flags"
        columns={[
          { key: "name", header: "Flag", render: f => <span className="av-mono">{f.name}</span> },
          {
            key: "source",
            header: "Source",
            render: f => f.declared ? <Badge>declared · default {String(f.default)}</Badge> : <Badge tone="accent">added here</Badge>
          },
          {
            key: "enabled",
            header: "Enabled",
            render: f => <Toggle label={f.name} checked={f.enabled} onChange={enabled => set.run({ name: f.name, enabled })} />
          },
          {
            key: "actions",
            header: "",
            align: "right",
            render: f => f.declared ? null : (
              <ActionButton size="sm" variant="danger" confirm="Remove?" onAction={() => remove.run({ name: f.name })}>
                Remove
              </ActionButton>
            )
          }
        ]}
      />
      <Row gap={8} style={{ padding: 12, borderTop: "1px solid var(--av-border)" }}>
        <Input
          placeholder="newFlagName"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          style={{ flex: 1 }}
          aria-label="New flag name"
        />
        <Button onClick={add} loading={set.pending} disabled={!name.trim()}>
          Add flag
        </Button>
      </Row>
    </Panel>
  );
});
