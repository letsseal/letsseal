"use client";

import { useState } from "react";

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
      setMsg("Network error — please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="text-lg font-semibold text-emerald-800">Verified ✓</div>
        <p className="mt-1.5 text-sm text-emerald-700">
          <b>{org}</b> is now verified as controlling <b>{domain}</b>. Documents it seals show the verified issuer badge.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">
        Confirm that <b>{org}</b> controls <b>{domain}</b>. This is the proof — you received it at a controller
        address for the domain.
      </p>
      <button
        onClick={confirm}
        disabled={state === "loading"}
        className="mt-5 inline-flex h-11 items-center rounded-[11px] bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
      >
        {state === "loading" ? "Verifying…" : `Verify ${domain}`}
      </button>
      {state === "error" && <p className="mt-3 text-sm text-red-600">{msg}</p>}
    </div>
  );
}
