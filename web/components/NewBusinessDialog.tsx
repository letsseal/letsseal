"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import { Field } from "@/components/common/field";
import { BRAND_SWATCHES, ColorSwatches } from "@/components/BrandingEditor";

const STRUCTURES = [
  { value: "single", label: "One business", hint: "A single company. You can add more later." },
  { value: "multi", label: "A brand with several entities", hint: "Legal entities under one brand, sharing a verified domain and team roles." },
] as const;

export default function NewBusinessDialog({
  tenantId, triggerLabel = "New business", title = "Create a business",
  description = "Each business has its own branding and signing certificate.",
  triggerVariant = "default", triggerSize = "default",
}: {
  tenantId?: string; triggerLabel?: string; title?: string; description?: string;
  triggerVariant?: "default" | "outline"; triggerSize?: "default" | "sm";
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState(BRAND_SWATCHES[0].hex);
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
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}><Plus /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={create} className="grid gap-4">
          <Field label={tenantId ? "Entity name" : "Business name"} htmlFor="new-biz-name">
            <Input id="new-biz-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Ltd" />
          </Field>
          <Field label="Brand colour">
            <ColorSwatches value={brandColor} onChange={setBrandColor} />
          </Field>

          {!tenantId && (
            <Field label="Structure">
              <RadioGroup
                aria-label="Structure"
                value={multiEntity ? "multi" : "single"}
                onValueChange={(v) => setMultiEntity(v === "multi")}
              >
                {STRUCTURES.map((s) => (
                  <label
                    key={s.value}
                    htmlFor={`structure-${s.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted has-data-[state=checked]:border-foreground/40 has-data-[state=checked]:bg-muted"
                  >
                    <RadioGroupItem id={`structure-${s.value}`} value={s.value} className="mt-0.5" />
                    <span className="grid gap-1">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-sm text-muted-foreground">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </Field>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" disabled={loading || name.trim().length < 2}>
              {loading && <Loader2 className="animate-spin" />}
              {tenantId ? "Add entity" : "Create business"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
