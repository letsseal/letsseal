"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CenteredPage } from "@/components/common/centered-page";

export function ConfirmDomain({ token, domain, org }: { token: string; domain: string; org: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function confirm() {
    setState("loading");
    try {
      const r = await fetch("/api/domain/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (r.ok && d.verified) setState("done");
      else { setState("error"); setMsg(d.error || "Could not verify this domain."); }
    } catch {
      setState("error");
      setMsg("Network error. Try again.");
    }
  }

  const names = (
    <>
      <span className="font-medium text-foreground">{org}</span> controls{" "}
      <span className="font-medium text-foreground">{domain}</span>
    </>
  );

  if (state === "done") {
    return (
      <CenteredPage
        className="max-w-md"
        icon={CircleCheck}
        iconClassName="text-success"
        title="Domain verified"
        description={<>Verified that {names}. Its documents now show the verified issuer badge.</>}
      />
    );
  }

  return (
    <CenteredPage className="max-w-md" icon={Globe} title="Verify domain" description={<>Confirm that {names}.</>}>
      <div className="grid gap-4">
        {state === "error" && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
        <Button onClick={confirm} disabled={state === "loading"} className="w-full">
          {state === "loading" && <Loader2 className="animate-spin" />}
          Verify {domain}
        </Button>
      </div>
    </CenteredPage>
  );
}
