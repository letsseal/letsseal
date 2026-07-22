"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";

const SWATCHES = ["#111827", "#2563eb", "#059669", "#db2777", "#ea580c", "#7c3aed"];

export default function NewBusinessDialog({
  tenantId, triggerLabel = "New business", title = "Create a business",
  description = "Each business gets its own branding and cryptographic signing certificate.",
}: {
  tenantId?: string; triggerLabel?: string; title?: string; description?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState(SWATCHES[0]);
  const [multiEntity, setMultiEntity] = useState(false); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brandColor, ...(tenantId ? { tenantId } : { enterprise: multiEntity }) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not create business"); setLoading(false); return; }
      setOpen(false);
      setName("");
      router.push(`/${data.slug}`);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="Acme Legal LLC" />
          </div>
          <div className="space-y-1.5">
            <Label>Brand colour</Label>
            <div className="flex gap-2">
              {SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setBrandColor(c)}
                        aria-label={c}
                        className={`h-8 w-8 rounded-full ring-offset-2 transition ${brandColor === c ? "ring-2 ring-foreground" : ""}`}
                        style={{ background: c }} />
              ))}
            </div>
          </div>

          {!tenantId && (
            <div className="space-y-1.5">
              <Label>What are you setting up?</Label>
              <div className="grid gap-2">
                <button type="button" onClick={() => setMultiEntity(false)}
                        className={`rounded-lg border p-3 text-left transition ${!multiEntity ? "border-foreground/40 bg-secondary/60" : "hover:bg-secondary/40"}`}>
                  <div className="text-sm font-medium">One business</div>
                  <div className="text-xs text-muted-foreground">A single company. You can add more separate businesses later.</div>
                </button>
                <button type="button" onClick={() => setMultiEntity(true)}
                        className={`rounded-lg border p-3 text-left transition ${multiEntity ? "border-foreground/40 bg-secondary/60" : "hover:bg-secondary/40"}`}>
                  <div className="text-sm font-medium">A brand with several entities</div>
                  <div className="text-xs text-muted-foreground">
                    One brand that runs multiple legal companies (e.g. a UK Ltd and a GmbH) sharing one verified
                    domain. Turns on the account &amp; team tools. You can also enable this later in Settings.
                  </div>
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" disabled={loading || name.trim().length < 2}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create business
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
