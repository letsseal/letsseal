"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/empty-state";
import { SettingsCard } from "@/components/common/settings-card";

type KeyRow = {
  id: string; name: string; prefix: string; lastFour: string; scopes: string;
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};

export default function ApiKeysManager({
  slug, initialKeys, appUrl,
}: { slug: string; initialKeys: KeyRow[]; appUrl: string }) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/orgs/${slug}/keys`);
    if (res.ok) setKeys((await res.json()).keys);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/keys`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "API key" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not create key"); return; }
      setNewSecret(data.secret);
      setName("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/keys/${revoking.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not revoke key"); return; }
      toast.success("Key revoked");
      setRevoking(null);
      await refresh();
    } finally {
      setRevokeBusy(false);
    }
  }

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <SettingsCard
      id="api-keys"
      title="API keys"
      description="Seal and verify from your own code. A key acts as this business, so keep it secret."
    >
      <div className="grid gap-4">
        <form onSubmit={create} className="flex gap-2">
          <Input aria-label="Key name" placeholder="Key name, e.g. Invoicing worker" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="outline" disabled={creating}>
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            Create key
          </Button>
        </form>

        {active.length === 0 ? (
          <EmptyState icon={KeyRound} title="No API keys yet" className="py-8" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Scopes</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="hidden sm:table-cell">Last used</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.split(",").map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{k.prefix}…{k.lastFour}</TableCell>
                    <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setRevoking(k)}>Revoke</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Send the key as a Bearer token to <code className="font-mono text-xs text-foreground">{appUrl}/api/v1</code>. Verifying needs no key.
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
{`curl -X POST ${appUrl}/api/v1/seal \\
  -H "Authorization: Bearer sk_live_…" \\
  -F file=@contract.pdf -o contract.sealed.pdf`}
          </pre>
        </div>
      </div>

      <Dialog open={!!newSecret} onOpenChange={(o) => !o && setNewSecret(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>You won&apos;t see it again. If you lose it, revoke it and create a new one.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{newSecret}</code>
            {newSecret && <CopyButton value={newSecret} toastMessage="Key copied" />}
          </div>
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>Anything using this key stops working immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={revoke} disabled={revokeBusy}>
              {revokeBusy && <Loader2 className="animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
