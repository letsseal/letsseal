"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/field";
import { SettingsCard } from "@/components/common/settings-card";
import { OrgAvatar } from "@/components/app-shell/OrgAvatar";
import { cn } from "@/lib/utils";

type Org = { slug: string; name: string; brandColor: string; logoUrl: string | null; fromEmail: string | null };

export const BRAND_SWATCHES = [
  { name: "Black", hex: "#111827" },
  { name: "Blue", hex: "#2563eb" },
  { name: "Green", hex: "#059669" },
  { name: "Pink", hex: "#db2777" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Red", hex: "#9e2b22" },
];

/** Brand colour swatches, with an optional custom colour picker. */
export function ColorSwatches({
  value, onChange, custom = false, label = "Brand colour",
}: { value: string; onChange: (hex: string) => void; custom?: boolean; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {BRAND_SWATCHES.map((s) => {
        const on = value.toLowerCase() === s.hex;
        return (
          <button
            key={s.hex}
            type="button"
            aria-label={s.name}
            aria-pressed={on}
            onClick={() => onChange(s.hex)}
            className={cn(
              "size-6 rounded-full outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60",
              on && "ring-2 ring-foreground focus-visible:ring-foreground"
            )}
            style={{ background: s.hex }}
          />
        );
      })}
      {custom && (
        <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 font-mono text-xs text-muted-foreground shadow-xs hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring/60">
          <span className="size-3.5 rounded-full border" style={{ background: value }} />
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" aria-label="Custom colour" />
          {value}
        </label>
      )}
    </div>
  );
}

export default function BrandingEditor({ org }: { org: Org }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [brandColor, setBrandColor] = useState(org.brandColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logoUrl);
  const [fromEmail, setFromEmail] = useState(org.fromEmail ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== org.name || brandColor !== org.brandColor ||
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
        body: JSON.stringify({ name, brandColor, logoUrl, fromEmail }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not save"); return; }
      toast.success("Saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Business"
      footerHint={dirty ? "Unsaved changes" : null}
      footer={
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[1fr_14rem]">
        <div className="grid gap-4">
          <Field label="Name" htmlFor="biz-name">
            <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Logo">
            <div className="flex items-center gap-3">
              <OrgAvatar name={name || "?"} color={brandColor} logoUrl={logoUrl} size="lg" />
              <Button asChild variant="outline" size="sm" className="cursor-pointer">
                <label>
                  <Upload /> Upload
                  <input type="file" accept="image/*" className="sr-only"
                         onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                </label>
              </Button>
              {logoUrl && (
                <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>Remove</Button>
              )}
            </div>
          </Field>

          <Field label="Brand colour">
            <ColorSwatches value={brandColor} onChange={setBrandColor} custom />
          </Field>

          <Field label="Reply-to email" htmlFor="from-email" optional>
            <Input id="from-email" type="email" placeholder="sign@yourbusiness.com"
                   value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </Field>
        </div>

        <div className="grid h-fit gap-2">
          <p className="text-xs text-muted-foreground">Preview</p>
          <div aria-hidden className="grid gap-4 rounded-lg border bg-background p-4">
            <div className="flex min-w-0 items-center gap-2">
              <OrgAvatar name={name || "?"} color={brandColor} logoUrl={logoUrl} size="md" />
              <span className="truncate text-sm font-medium">{name || "Business name"}</span>
            </div>
            <span
              className="flex h-9 items-center justify-center rounded-md text-sm font-medium text-white"
              style={{ background: brandColor }}
            >
              Sign document
            </span>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
