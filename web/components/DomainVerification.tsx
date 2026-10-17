"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/common/field";
import { CopyButton } from "@/components/common/copy-button";
import { SettingsCard } from "@/components/common/settings-card";
import { StatusBadge } from "@/components/common/status-badge";

const ALIASES = ["admin", "administrator", "postmaster", "hostmaster", "webmaster"];

type Verified = { domain: string; via: string | null };
type PendingDns = { kind: "dns"; domain: string; recordName: string; recordValue: string };
type PendingEmail = { kind: "email"; domain: string; sentTo: string };
type Pending = PendingDns | PendingEmail | null;

function viaLabel(via: string | null): string {
  return via ? ({ dns: "Verified via DNS", email: "Verified via admin email", http: "Verified via website file", operator: "Verified by the operator" }[via] ?? "") : "";
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
  const [confirmRemove, setConfirmRemove] = useState(false);

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
    } catch { setError("Network error. Try again."); } finally { setBusy(false); }
  }

  async function check() {
    setBusy(true); setError(""); setCheckMsg("");
    try {
      const r = await fetch(`/api/orgs/${slug}/domain/check`, { method: "POST" });
      const d = await r.json();
      if (d.verified) { setVerified({ domain: (pending as PendingDns).domain, via: "dns" }); setPending(null); }
      else setCheckMsg(d.error || "Not verified yet.");
    } catch { setCheckMsg("Network error. Try again."); } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/orgs/${slug}/domain`, { method: "DELETE" });
      setVerified(null); setPending(null); setDomain(""); setConfirmRemove(false);
    } finally { setBusy(false); }
  }

  function reset() { setPending(null); setError(""); setCheckMsg(""); }

  const title = (tone: "success" | "warning" | "neutral", label: string) => (
    <span className="flex items-center gap-2">Domain <StatusBadge tone={tone}>{label}</StatusBadge></span>
  );

  if (verified) {
    return (
      <SettingsCard
        id="issuer-identity"
        title={title("success", "Verified")}
        description="Proofs from this business show a verified badge with this domain."
        footerHint={viaLabel(verified.via)}
        footer={<Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>Remove</Button>}
      >
        <p className="font-mono text-sm">{verified.domain}</p>
        <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove domain verification?</DialogTitle>
              <DialogDescription>Proofs from this business will show as unverified until you verify again.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant="destructive" onClick={remove} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsCard>
    );
  }

  if (pending?.kind === "dns") {
    return (
      <SettingsCard
        id="issuer-identity"
        title={title("warning", "Pending")}
        description={<>Add this TXT record to the DNS for <span className="font-medium text-foreground">{pending.domain}</span>, then check.</>}
        footerHint="DNS changes can take a few minutes."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
            <Button size="sm" onClick={check} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Check now
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <dl className="divide-y rounded-md border bg-muted font-mono text-xs">
            {([["Name", pending.recordName, true], ["Type", "TXT", false], ["Value", pending.recordValue, true]] as const).map(([k, v, copy]) => (
              <div key={k} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                <dt className="w-12 shrink-0 font-sans text-muted-foreground">{k}</dt>
                <dd className="min-w-0 flex-1 break-all">{v}</dd>
                {copy && <CopyButton value={v} variant="ghost" size="icon-xs" />}
              </div>
            ))}
          </dl>
          {checkMsg && <Alert variant="warning"><AlertDescription>{checkMsg}</AlertDescription></Alert>}
        </div>
      </SettingsCard>
    );
  }

  if (pending?.kind === "email") {
    return (
      <SettingsCard
        id="issuer-identity"
        title={title("warning", "Pending")}
        description={<>We emailed a link to <span className="font-medium text-foreground">{pending.sentTo}</span>. Open it from that mailbox to verify {pending.domain}. It expires in 24 hours.</>}
        footer={<Button variant="outline" size="sm" onClick={reset}>Use a different method</Button>}
      />
    );
  }

  return (
    <SettingsCard
      id="issuer-identity"
      title={title("neutral", "Not verified")}
      description="Verify your domain to show a verified badge on every proof. Until then, proofs show your business name as unverified."
      footer={
        <Button size="sm" onClick={start} disabled={busy || !domain}>
          {busy && <Loader2 className="animate-spin" />}
          {method === "dns" ? "Get DNS record" : "Send email"}
        </Button>
      }
    >
      <div className="grid gap-4">
        <Field label="Domain" htmlFor="verify-domain">
          <Input id="verify-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.co.uk" />
        </Field>
        <Field label="Method">
          <ToggleGroup type="single" value={method} onValueChange={(v) => v && setMethod(v as "dns" | "email")} aria-label="Verification method">
            <ToggleGroupItem value="dns">DNS record</ToggleGroupItem>
            <ToggleGroupItem value="email">Admin email</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        {method === "email" && (
          <Field label="Send to" hint="Only admin addresses prove you control the domain.">
            <div className="flex items-center gap-1.5">
              <Select value={alias} onValueChange={setAlias}>
                <SelectTrigger aria-label="Admin address" className="rounded-md shadow-xs data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIASES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="truncate text-sm text-muted-foreground">@{domain || "yourdomain.com"}</span>
            </div>
          </Field>
        )}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </div>
    </SettingsCard>
  );
}
