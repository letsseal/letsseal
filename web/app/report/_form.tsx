"use client";

import { useState } from "react";

const CATEGORIES = [
  { v: "impersonation", label: "Impersonation — claims to be a business it isn't" },
  { v: "fraud", label: "Fraudulent or forged documents" },
  { v: "phishing", label: "Phishing / scam" },
  { v: "other", label: "Other abuse" },
];

export function ReportForm({ slug, orgName, proofHash }: { slug: string; orgName: string; proofHash?: string }) {
  const [category, setCategory] = useState("impersonation");
  const [detail, setDetail] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    setState("sending"); setError("");
    try {
      const r = await fetch("/api/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: slug, category, detail, reporterEmail: email, proofHash: proofHash || undefined }),
      });
      const d = await r.json();
      if (r.ok) setState("done");
      else { setState("error"); setError(d.error || "Could not submit the report."); }
    } catch { setState("error"); setError("Network error — please try again."); }
  }

  if (state === "done") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-sm font-semibold text-emerald-800">Report received</div>
        <p className="mt-1 text-sm text-emerald-700">
          Thank you. We&apos;ll review <b>{orgName}</b> and act if it breaches our policy. Suspended issuers are
          blocked from sealing and flagged on every proof they issued.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
        Reporting: <b>{orgName}</b> <span className="text-muted-foreground">({slug})</span>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">What&apos;s wrong?</label>
        <div className="mt-1.5 space-y-1.5">
          {CATEGORIES.map((c) => (
            <label key={c.v} className="flex items-start gap-2 text-sm">
              <input type="radio" name="cat" value={c.v} checked={category === c.v} onChange={() => setCategory(c.v)} className="mt-1" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Details (optional)</label>
        <textarea
          value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} maxLength={2000}
          placeholder="What did you see? Who is the real party being impersonated?"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Your email (optional — so we can follow up)</label>
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={submit} disabled={state === "sending"}
        className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {state === "sending" ? "Submitting…" : "Submit report"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
