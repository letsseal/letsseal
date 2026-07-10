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

export default function NewBusinessDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState(SWATCHES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brandColor }),
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
        <Button className="gap-2"><Plus className="h-4 w-4" /> New business</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a business</DialogTitle>
          <DialogDescription>
            Each business gets its own branding and cryptographic signing certificate.
          </DialogDescription>
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
