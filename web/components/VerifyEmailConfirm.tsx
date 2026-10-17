"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CenteredPage } from "@/components/common/centered-page";

export default function VerifyEmailConfirm({ token }: { token?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">(token ? "idle" : "err");

  async function confirm() {
    setState("loading");
    try {
      const r = await fetch("/api/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(r.ok ? "ok" : "err");
    } catch {
      setState("err");
    }
  }

  if (state === "ok") {
    return (
      <CenteredPage icon={CircleCheck} iconClassName="text-success" title="Email verified" description="Your account is active.">
        <Button asChild className="w-full"><Link href="/signin">Continue to sign in</Link></Button>
      </CenteredPage>
    );
  }

  if (state === "err") {
    return (
      <CenteredPage
        icon={CircleX}
        title="Link invalid or expired"
        description="Sign in and we'll send you a new verification link."
      >
        <Button asChild variant="outline" className="w-full"><Link href="/signin">Go to sign in</Link></Button>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage icon={MailCheck} title="Verify your email">
      <Button onClick={confirm} disabled={state === "loading"} className="w-full">
        {state === "loading" && <Loader2 className="animate-spin" />}
        Verify email
      </Button>
    </CenteredPage>
  );
}
