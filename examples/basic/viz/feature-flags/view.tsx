import { defineView } from "alchemy-viz/client";
import { Button, type Column, ConfirmButton, DataTable, ErrorBanner, Input, Panel, Path, Switch } from "alchemy-viz/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import type server from "./server.ts";

interface Flag {
  name: string,
  enabled: boolean,
  declared: boolean,
  default: boolean | undefined
}

export default defineView<typeof server>(({ resource, stack, api }) => {
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
      cell: f => (f.declared
        ? <span className="text-[13px] text-fg-muted">Declared, default <span className="font-mono text-xs">{String(f.default)}</span></span>
        : <span className="text-[13px] text-fg-muted">Added here</span>)
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
    <Panel className="max-w-4xl" title="Feature flags" actions={<Path path={resource.attr.file} home={stack.home} className="max-w-80 text-fg-subtle" />} flush>
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
