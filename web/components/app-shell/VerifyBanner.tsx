"use client";

import { useState } from "react";
import { Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function VerifyBanner({ email }: { email: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");

  async function resend() {
    setState("busy");
    try {
      const res = await fetch("/api/verify-email/resend", { method: "POST" });
      if (!res.ok) throw new Error();
      setState("sent");
      toast.success(`Verification link sent to ${email ?? "your email"}`);
    } catch {
      setState("idle");
      toast.error("Couldn't send the link. Try again in a moment.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-2.5 text-sm surface-warning md:px-10">
      <MailWarning className="size-4 shrink-0" />
      <span className="text-foreground">
        Verify your email to send documents for signing.{email ? ` We sent a link to ${email}.` : ""}
      </span>
      <Button size="xs" variant="outline" className="ml-auto" onClick={resend} disabled={state !== "idle"}>
        {state === "busy" && <Loader2 className="animate-spin" />}
        {state === "sent" ? "Sent" : "Resend link"}
      </Button>
    </div>
  );
}
