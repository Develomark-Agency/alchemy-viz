import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type Api, defineView, ResourceLink } from "../../../client/index.tsx";
import {
  Badge,
  Button,
  ConfirmButton,
  CopyButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  ErrorBanner,
  Field,
  FieldDescription,
  FieldLabel,
  IconButton,
  Input,
  Loading,
  Panel,
  Textarea,
  toast
} from "../../../ui/index.ts";
import type server from "./server.ts";
import type { SecretEntry } from "./server.ts";

type SecretsApi = Api<typeof server>;

export default defineView<typeof server>(({ api, resource }) => {
  const list = api.list.useQuery();
  const single = resource.type === "Cloudflare.SecretsStore.Secret";
  const [editing, setEditing] = useState<{ name: string, isNew: boolean }>();

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={single ? "Value" : <>Secrets {list.data && <span className="font-normal text-fg-subtle tabular-nums">{list.data.length}</span>}</>}
        actions={!single && (
          <Button size="sm" variant="primary" onClick={() => setEditing({ name: "", isNew: true })}>
            <Plus />
            New secret
          </Button>
        )}
        flush
      >
        {list.error
          ? <ErrorBanner error={list.error} className="m-4" />
          : !list.data
            ? <Loading />
            : list.data.length === 0
              ? (
                <EmptyState title={single ? "No value yet" : "No secrets"}>
                  {single ? "Deploy the stack to seed it, or set one here." : "Add one here, or declare a Cloudflare.SecretsStore.Secret in the stack."}
                </EmptyState>
              )
              : (
                <ul className="divide-y divide-line">
                  {list.data.map(s => <SecretRow key={s.name} api={api} secret={s} onEdit={() => setEditing({ name: s.name, isNew: false })} />)}
                </ul>
              )}
        {single && list.data?.length === 0 && (
          <div className="flex justify-center pb-4">
            <Button size="sm" onClick={() => setEditing({ name: String(resource.attr?.secretName ?? ""), isNew: false })}>Set value</Button>
          </div>
        )}
      </Panel>
      <p className="px-1 text-xs text-fg-subtle">
        These are the local store's values, which only <code className="font-mono">alchemy dev</code> sees. A secret the stack declares gets its value written again on the next deploy.
      </p>
      <EditDialog api={api} target={editing} onClose={() => setEditing(undefined)} />
    </div>
  );
});

function SecretRow({ api, secret, onEdit }: { api: SecretsApi, secret: SecretEntry, onEdit: () => void }) {
  const [shown, setShown] = useState(false);
  const reveal = api.reveal.useQuery({ name: secret.name }, { enabled: shown });
  const del = api.delete.useMutation();

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[13px]">{secret.name}</span>
          {secret.managedBy && <Badge>managed</Badge>}
        </span>
        {secret.managedBy && (
          <span className="text-xs text-fg-subtle">
            Declared by <ResourceLink fqn={secret.managedBy} className="font-mono hover:underline" />
          </span>
        )}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1">
        <span className="max-w-72 truncate font-mono text-xs text-fg-muted" title={shown ? reveal.data?.value : undefined}>
          {shown ? (reveal.isPending ? "…" : reveal.error ? "Couldn't read" : reveal.data?.value) : "••••••••••••"}
        </span>
        {shown && reveal.data && <CopyButton text={reveal.data.value} label="Copy value" />}
        <IconButton label={shown ? "Hide value" : "Show value"} variant="ghost" onClick={() => setShown(s => !s)}>
          {shown ? <EyeOff /> : <Eye />}
        </IconButton>
        <IconButton label="Change value" variant="ghost" onClick={onEdit}>
          <Pencil />
        </IconButton>
        <ConfirmButton
          title={`Delete ${secret.name}?`}
          description={secret.managedBy ? "It's removed from the local store until the stack deploys it again." : "It's removed from the local store."}
          onConfirm={async () => {
            await del.mutateAsync({ name: secret.name });
            toast("Deleted", { description: secret.name });
          }}
          trigger={<IconButton label="Delete secret" variant="ghost"><Trash2 /></IconButton>}
        />
      </div>
    </li>
  );
}

function EditDialog({ api, target, onClose }: { api: SecretsApi, target: { name: string, isNew: boolean } | undefined, onClose: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [lastTarget, setLastTarget] = useState(target);
  if(target !== lastTarget) {
    setLastTarget(target);
    if(target) {
      setName(target.name);
      setValue("");
    }
  }
  const put = api.put.useMutation();

  async function submit() {
    try {
      await put.mutateAsync({ name, value });
      toast(target?.isNew ? "Secret added" : "Value changed", { description: name });
      onClose();
    } catch {}
  }

  return (
    <Dialog open={!!target} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{target?.isNew ? "New secret" : `Change ${target?.name ?? ""}`}</DialogTitle>
        <DialogBody>
          {target?.isNew && (
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={name} onValueChange={setName} autoFocus className="font-mono text-xs" />
            </Field>
          )}
          <Field>
            <FieldLabel>Value</FieldLabel>
            <Textarea value={value} onValueChange={setValue} autoFocus={!target?.isNew} rows={3} className="font-mono text-xs" />
            <FieldDescription>Stored as plain text in the local store.</FieldDescription>
          </Field>
          <ErrorBanner error={put.error} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name || !value || put.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
