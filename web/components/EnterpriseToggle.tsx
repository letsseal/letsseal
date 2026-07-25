"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EnterpriseToggle({ tenantId, tenantName, enabled }: { tenantId: string; tenantName: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enterprise: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not update"); setLoading(false); return; }
      setOn(next);
      setLoading(false);
      router.refresh(); 
    } catch {
      setError("Something went wrong."); setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Team &amp; multiple entities
            {on && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">On</span>}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            For a brand that runs several legal entities (e.g. a UK Ltd and a GmbH under
            one company) or wants more than one person on the account. It turns on:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> An <b>Account</b> area to manage several entities under one brand, each with its own signing certificate.</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> <b>Roles</b> for teammates (admin / signer / viewer) instead of everyone having full access.</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> Inviting coworkers to the account <span className="opacity-70">(coming next)</span>.</li>
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground">
            It&rsquo;s a feature switch, not a paid plan — Let&rsquo;s Seal is free. If you just
            run one business with one login, you don&rsquo;t need this. You can turn it off again
            anytime; your entities and data are untouched.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <Button
          variant={on ? "outline" : "default"}
          disabled={loading}
          onClick={() => toggle(!on)}
          className="shrink-0"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {on ? "Turn off" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
