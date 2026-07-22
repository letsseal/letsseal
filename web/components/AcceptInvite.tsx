"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not accept"); setLoading(false); return; }
      router.push(data.orgSlug ? `/${data.orgSlug}` : "/app");
      router.refresh();
    } catch {
      setError("Something went wrong."); setLoading(false);
    }
  }

  return (
    <div>
      <Button onClick={accept} disabled={loading} className="w-full">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Accept invitation
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
