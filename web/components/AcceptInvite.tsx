"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not accept the invitation."); setLoading(false); return; }
      router.push(data.orgSlug ? `/${data.orgSlug}` : "/app");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again."); setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={accept} disabled={loading} className="w-full">
        {loading && <Loader2 className="animate-spin" />}
        Accept invitation
      </Button>
    </div>
  );
}
