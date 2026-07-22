"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <>
        <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
        <h1 className="text-lg font-semibold mt-4">Email verified</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account is confirmed. You can now send documents for signing.
        </p>
        <Button asChild className="mt-6 w-full"><Link href="/signin">Continue to sign in</Link></Button>
      </>
    );
  }

  if (state === "err") {
    return (
      <>
        <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold mt-4">Link invalid or expired</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This verification link is no longer valid. Sign in and we&apos;ll send you a fresh one.
        </p>
        <Button asChild variant="outline" className="mt-6 w-full"><Link href="/signin">Go to sign in</Link></Button>
      </>
    );
  }

  return (
    <>
      <MailCheck className="h-12 w-12 mx-auto text-primary" />
      <h1 className="text-lg font-semibold mt-4">Confirm your email</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Click below to verify this address and activate your account.
      </p>
      <Button onClick={confirm} disabled={state === "loading"} className="mt-6 w-full">
        {state === "loading" ? "Verifying…" : "Verify my email"}
      </Button>
    </>
  );
}
