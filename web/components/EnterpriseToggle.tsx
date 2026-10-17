"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsCard } from "@/components/common/settings-card";

export function EnterpriseToggle({ tenantId, enabled }: { tenantId: string; enabled: boolean }) {
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
      setError("Something went wrong. Try again."); setLoading(false);
    }
  }

  return (
    <SettingsCard
      id="account"
      title="Team & entities"
      description="For a brand with several legal entities, or more than one person on the account."
    >
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <Label htmlFor="enterprise-toggle">Entities, people and roles</Label>
          {on && <p className="text-sm text-muted-foreground">Turning this off keeps your entities and data.</p>}
        </div>
        <Switch id="enterprise-toggle" checked={on} disabled={loading} onCheckedChange={toggle} />
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </SettingsCard>
  );
}
