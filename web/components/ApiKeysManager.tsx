"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Check, Plus, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

type KeyRow = {
  id: string; name: string; prefix: string; lastFour: string; scopes: string;
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm" className="gap-1.5 shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true); setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function ApiKeysManager({
  slug, initialKeys, appUrl,
}: { slug: string; initialKeys: KeyRow[]; appUrl: string }) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/orgs/${slug}/keys`);
    if (res.ok) setKeys((await res.json()).keys);
  }

  async function create() {
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

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any integration using it stops working immediately.")) return;
    const res = await fetch(`/api/orgs/${slug}/keys/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not revoke"); return; }
    toast.success("Key revoked");
    await refresh();
  }

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1.5 block text-sm font-medium">New key label</label>
          <Input
            placeholder="e.g. CI pipeline, invoicing worker"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </div>
        <Button onClick={create} disabled={creating} className="gap-1.5">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create key
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <KeyRound className="mx-auto mb-2 h-6 w-6 opacity-40" />
          No API keys yet. Create one to seal, verify, and anchor from your own code.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {active.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{k.name}</span>
                  {k.scopes.split(",").map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {k.prefix}…{k.lastFour}
                  <span className="ml-2 font-sans">
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => revoke(k.id)}>
                <Trash2 className="h-4 w-4" /> Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Using your key</p>
        <p className="mt-1 text-muted-foreground">
          Point any Let&apos;s Seal SDK or a plain HTTP call at
          <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">{appUrl}/api/v1</code>
          with an <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Authorization: Bearer</code> header.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-background p-3 font-mono text-xs leading-relaxed">
{`curl -X POST ${appUrl}/api/v1/seal \\
  -H "Authorization: Bearer sk_live_…" \\
  -F file=@contract.pdf -o contract.sealed.pdf
# → sealed PDF + a permanent proof URL in the X-Letsseal-Proof-Url header`}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Verification is public and needs no key: <code className="rounded bg-muted px-1 py-0.5 font-mono">POST /api/v1/verify</code>.
        </p>
      </div>

      <Dialog open={!!newSecret} onOpenChange={(o) => !o && setNewSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key now</DialogTitle>
            <DialogDescription>
              This is the only time we&apos;ll show it. We store only a hash — if you lose it, revoke and make a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{newSecret}</code>
            {newSecret && <CopyButton value={newSecret} />}
          </div>
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
