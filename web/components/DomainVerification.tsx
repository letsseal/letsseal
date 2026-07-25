"use client";

import { useState } from "react";
import { BadgeCheck, ShieldAlert, Copy, Check } from "lucide-react";

const ALIASES = ["admin", "administrator", "postmaster", "hostmaster", "webmaster"];

type Verified = { domain: string; via: string | null };
type PendingDns = { kind: "dns"; domain: string; recordName: string; recordValue: string };
type PendingEmail = { kind: "email"; domain: string; sentTo: string };
type Pending = PendingDns | PendingEmail | null;

function viaLabel(via: string | null): string {
  return via ? ({ dns: "via DNS", email: "via domain admin email", http: "via website file", operator: "by the operator" }[via] ?? "") : "";
}

export default function DomainVerification({
  slug, initialVerified, initialPending,
}: { slug: string; initialVerified: Verified | null; initialPending: Pending }) {
  const [verified, setVerified] = useState<Verified | null>(initialVerified);
  const [pending, setPending] = useState<Pending>(initialPending);
  const [domain, setDomain] = useState("");
  const [method, setMethod] = useState<"dns" | "email">("dns");
  const [alias, setAlias] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkMsg, setCheckMsg] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function start() {
    setBusy(true); setError(""); setCheckMsg("");
    try {
      const r = await fetch(`/api/orgs/${slug}/domain`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, method, alias }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Could not start verification."); return; }
      if (d.method === "dns") setPending({ kind: "dns", domain: d.domain, recordName: d.recordName, recordValue: d.recordValue });
      else setPending({ kind: "email", domain: d.domain, sentTo: d.sentTo });
    } catch { setError("Network error — try again."); } finally { setBusy(false); }
  }

  async function check() {
    setBusy(true); setError(""); setCheckMsg("");
    try {
      const r = await fetch(`/api/orgs/${slug}/domain/check`, { method: "POST" });
      const d = await r.json();
      if (d.verified) { setVerified({ domain: (pending as PendingDns).domain, via: "dns" }); setPending(null); }
      else setCheckMsg(d.error || "Not verified yet.");
    } catch { setCheckMsg("Network error — try again."); } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm("Remove domain verification for this organisation? Its seals will show as unverified until you re-verify.")) return;
    setBusy(true);
    try {
      await fetch(`/api/orgs/${slug}/domain`, { method: "DELETE" });
      setVerified(null); setPending(null); setDomain("");
    } finally { setBusy(false); }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(text); setTimeout(() => setCopied(null), 1500);
  }

  function reset() { setPending(null); setError(""); setCheckMsg(""); }

  if (verified) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-emerald-800">Verified issuer identity</div>
            <p className="mt-1 text-sm text-emerald-700">
              Confirmed control of <b>{verified.domain}</b> {viaLabel(verified.via)}. Documents you seal show a verified
              badge with this domain.
            </p>
          </div>
          <button onClick={remove} disabled={busy} className="shrink-0 text-xs font-medium text-emerald-700 underline hover:text-emerald-900 disabled:opacity-50">
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <div className="text-sm font-semibold">Not verified</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Right now your organisation&apos;s name is shown on proofs as a self-asserted claim. Verify control of your
            domain to earn a verified issuer badge. Your identity becomes the domain — globally unique, so it never
            clashes with another business of the same name.
          </p>
        </div>
      </div>

      {pending?.kind === "dns" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm">Add this <b>TXT</b> record to the DNS for <b>{pending.domain}</b>, then check:</p>
          <div className="space-y-2 rounded-lg bg-muted p-3 font-mono text-xs">
            {[["Name / host", pending.recordName], ["Type", "TXT"], ["Value", pending.recordValue]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{k}</span>
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate">{v}</span>
                  {k !== "Type" && (
                    <button onClick={() => copy(v)} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy">
                      {copied === v ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={check} disabled={busy} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? "Checking…" : "Check now"}
            </button>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Start over</button>
          </div>
          {checkMsg && <p className="text-sm text-amber-600">{checkMsg}</p>}
        </div>
      ) : pending?.kind === "email" ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            We sent a verification link to <b>{pending.sentTo}</b>. Open it from that mailbox to verify <b>{pending.domain}</b>.
            The link expires in 24 hours.
          </div>
          <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Use a different method</button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Domain</label>
            <input
              value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.co.uk"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["dns", "email"] as const).map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${method === m ? "border-blue-500 bg-blue-50 text-blue-700" : "text-muted-foreground hover:bg-muted"}`}>
                {m === "dns" ? "DNS record" : "Email a domain admin"}
              </button>
            ))}
          </div>
          {method === "email" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Send to</label>
              <div className="mt-1 flex items-center gap-1.5">
                <select value={alias} onChange={(e) => setAlias(e.target.value)} className="rounded-lg border bg-background px-2 py-2 text-sm">
                  {ALIASES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <span className="text-sm text-muted-foreground">@{domain || "yourdomain.com"}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Only these controller addresses are accepted — proof you administer the domain, not just one mailbox.</p>
            </div>
          )}
          <button onClick={start} disabled={busy || !domain} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Starting…" : method === "dns" ? "Get DNS record" : "Send verification email"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
