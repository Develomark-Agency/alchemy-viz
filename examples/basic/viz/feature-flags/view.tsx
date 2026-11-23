import { defineView } from "alchemy-viz/client";
import { Badge, Button, type Column, ConfirmButton, DataTable, ErrorBanner, Input, Panel, Switch } from "alchemy-viz/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import type server from "./server.ts";

interface Flag {
  name: string,
  enabled: boolean,
  declared: boolean,
  default: boolean | undefined
}

export default defineView<typeof server>(({ resource, api }) => {
  const flags = api.flags.useQuery();
  const set = api.set.useMutation();
  const remove = api.remove.useMutation();
  const [name, setName] = useState("");

  const columns: Array<Column<Flag>> = [
    { id: "name", header: "Flag", size: 220, cell: f => <span className="font-mono text-xs">{f.name}</span> },
    {
      id: "source",
      header: "Source",
      size: 220,
      accessor: f => (f.declared ? 0 : 1),
      cell: f => (f.declared ? <Badge>declared · default {String(f.default)}</Badge> : <Badge tone="accent">added here</Badge>)
    },
    {
      id: "enabled",
      header: "Enabled",
      size: 110,
      cell: f => <Switch aria-label={f.name} checked={f.enabled} onCheckedChange={enabled => set.mutate({ name: f.name, enabled })} />
    },
    {
      id: "actions",
      header: "",
      size: 110,
      sortable: false,
      align: "right",
      cell: f => (f.declared ? null : <ConfirmButton title={`Remove ${f.name}?`} onConfirm={() => remove.mutateAsync({ name: f.name })}>Remove</ConfirmButton>)
    }
  ];

  async function add() {
    try {
      await set.mutateAsync({ name: name.trim(), enabled: false });
      setName("");
    } catch {}
  }

  return (
    <Panel title="Feature flags" actions={<span className="font-mono text-xs text-fg-subtle">{resource.attr.file}</span>} flush>
      <ErrorBanner error={set.error ?? remove.error} className="m-3" />
      <DataTable rows={flags.data} loading={flags.isPending} error={flags.error} columns={columns} getRowId={f => f.name} empty="No flags" />
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={e => {
          e.preventDefault();
          add();
        }}
      >
        <Input aria-label="New flag name" placeholder="newFlagName" value={name} onValueChange={setName} className="flex-1 font-mono text-xs" />
        <Button type="button" disabled={!name.trim()} onClick={add}>
          <Plus />
          Add flag
        </Button>
      </form>
    </Panel>
  );
});
