"use client";

import { useState } from "react";
import { MailWarning, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

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
      toast.error("Couldn't send — try again in a moment.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-200 bg-amber-50 px-8 py-2.5 text-sm text-amber-900">
      <MailWarning className="h-4 w-4 shrink-0 text-amber-600" />
      <span>
        <b>Verify your email</b> to send documents for signing.{email ? ` We sent a link to ${email}.` : ""}
      </span>
      <button
        onClick={resend}
        disabled={state !== "idle"}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
      >
        {state === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "sent" ? <Check className="h-3.5 w-3.5" /> : null}
        {state === "sent" ? "Sent — check your inbox" : "Resend link"}
      </button>
    </div>
  );
}
