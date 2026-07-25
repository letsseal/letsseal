"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Org = {
  slug: string; name: string; brandColor: string; accentColor: string;
  logoUrl: string | null; fromEmail: string | null;
};

const SWATCHES = ["#111827", "#2563eb", "#059669", "#db2777", "#ea580c", "#7c3aed", "#0f766e", "#9e2b22"];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)}
                  className={`h-7 w-7 rounded-full ring-offset-2 transition ${value.toLowerCase() === c ? "ring-2 ring-foreground" : ""}`}
                  style={{ background: c }} />
        ))}
        <label className="flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs text-muted-foreground cursor-pointer">
          <span className="h-4 w-4 rounded-full border" style={{ background: value }} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
          {value}
        </label>
      </div>
    </div>
  );
}

export default function BrandingEditor({ org }: { org: Org }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [brandColor, setBrandColor] = useState(org.brandColor);
  const [accentColor, setAccentColor] = useState(org.accentColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logoUrl);
  const [fromEmail, setFromEmail] = useState(org.fromEmail ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== org.name || brandColor !== org.brandColor || accentColor !== org.accentColor ||
    logoUrl !== org.logoUrl || fromEmail !== (org.fromEmail ?? "");

  async function pickLogo(file: File) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    URL.revokeObjectURL(url);
    setLogoUrl(canvas.toDataURL("image/png"));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${org.slug}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brandColor, accentColor, logoUrl, fromEmail }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not save"); return; }
      toast.success("Branding saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="biz-name">Business name</Label>
          <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl text-2xl font-semibold text-white"
                  style={{ background: brandColor }}>
              {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : name[0]?.toUpperCase()}
            </span>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5 cursor-pointer">
                <label>
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input type="file" accept="image/*" className="hidden"
                         onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                </label>
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setLogoUrl(null)}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Square works best. Auto-resized to 256px.</p>
        </div>

        <ColorField label="Brand colour" value={brandColor} onChange={setBrandColor} />
        <ColorField label="Accent colour" value={accentColor} onChange={setAccentColor} />

        <div className="space-y-2">
          <Label htmlFor="from-email">From-email <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="from-email" type="email" placeholder="sign@yourbusiness.com"
                 value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 border-t pt-5">
          <Button onClick={save} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-20 h-fit">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="h-2" style={{ background: brandColor }} />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg text-lg font-semibold text-white"
                    style={{ background: brandColor }}>
                {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : name[0]?.toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{name || "Business name"}</div>
                <div className="text-xs text-muted-foreground">Signing portal</div>
              </div>
            </div>
            <Button className="mt-4 w-full text-white" style={{ background: brandColor }}>Sign document</Button>
            <button className="mt-2 w-full rounded-md py-1.5 text-sm font-medium" style={{ color: accentColor }}>
              Secondary action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
