"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Award, Copy, ExternalLink, Ban, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Cred = {
  id: string; recipientName: string; recipientEmail: string | null; credType: string;
  title: string; credentialCode: string | null; issuedOn: string; expiresOn: string | null;
  sha256: string | null; revokedAt: string | null;
};

const TYPES = ["Certificate of Completion", "Certificate of Achievement", "CPD Certificate",
  "Professional Licence", "Insurance Certificate", "Membership", "Training Certificate"];

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CredentialsManager({
  slug, initial, appUrl,
}: { slug: string; initial: Cred[]; appUrl: string }) {
  const router = useRouter();
  const [f, setF] = useState({ recipientName: "", recipientEmail: "", credType: TYPES[0], title: "", credentialCode: "", issuedOn: todayISO(), expiresOn: "", description: "" });
  const [issuing, setIssuing] = useState(false);
  const [last, setLast] = useState<{ proofUrl: string; recipientName: string; emailed: boolean } | null>(null);
  const [csv, setCsv] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function issue() {
    if (!f.recipientName.trim() || !f.title.trim()) { toast.error("Recipient and credential title are required"); return; }
    setIssuing(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/credentials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, recipientEmail: f.recipientEmail || undefined, expiresOn: f.expiresOn || undefined }),
      });
      const data = await res.json();
      const r = data.results?.[0];
      if (!res.ok || !r?.ok) { toast.error(r?.error ?? data.error ?? "Could not issue"); return; }
      setLast({ proofUrl: r.proofUrl, recipientName: f.recipientName, emailed: r.emailed });
      toast.success(`Issued to ${f.recipientName}${r.emailed ? " · emailed" : ""}`);
      setF((p) => ({ ...p, recipientName: "", recipientEmail: "", title: "", credentialCode: "", expiresOn: "", description: "" }));
      router.refresh();
    } finally { setIssuing(false); }
  }

  async function issueBatch() {
    const rows = parseCsv(csv);
    if (rows.length === 0) { toast.error("No rows parsed — check the header line"); return; }
    setBatchBusy(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/credentials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: rows }),
      });
      const data = await res.json();
      if (!res.ok && !data.issued) { toast.error(data.error ?? "Batch failed"); return; }
      toast.success(`Issued ${data.issued} of ${data.total}`);
      if (data.issued < data.total) toast.error(`${data.total - data.issued} row(s) failed — check names/titles`);
      setCsv("");
      router.refresh();
    } finally { setBatchBusy(false); }
  }

  async function revoke(c: Cred) {
    const reason = prompt(`Revoke "${c.title}" issued to ${c.recipientName}? Optional reason:`);
    if (reason === null) return;
    const res = await fetch(`/api/orgs/${slug}/credentials/${c.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) { toast.error("Could not revoke"); return; }
    toast.success("Credential revoked");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">Issue a credential</TabsTrigger>
          <TabsTrigger value="batch">Batch (CSV)</TabsTrigger>
        </TabsList>

        <TabsContent value="one" className="mt-4">
          <div className="rounded-xl border p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name *"><Input value={f.recipientName} onChange={set("recipientName")} placeholder="Jane Smith" /></Field>
              <Field label="Recipient email (to send them the link)"><Input type="email" value={f.recipientEmail} onChange={set("recipientEmail")} placeholder="jane@example.com" /></Field>
              <Field label="Type">
                <Input list="cred-types" value={f.credType} onChange={set("credType")} />
                <datalist id="cred-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
              <Field label="Credential title *"><Input value={f.title} onChange={set("title")} placeholder="Advanced First Aid" /></Field>
              <Field label="Reference / ID (optional)"><Input value={f.credentialCode} onChange={set("credentialCode")} placeholder="CERT-2026-0481" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Issued on"><Input type="date" value={f.issuedOn} onChange={set("issuedOn")} /></Field>
                <Field label="Expires (optional)"><Input type="date" value={f.expiresOn} onChange={set("expiresOn")} /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Details (optional)"><Input value={f.description} onChange={set("description")} placeholder="Completed 16 hours of assessed training." /></Field>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button onClick={issue} disabled={issuing} className="gap-1.5">
                {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Issue &amp; seal
              </Button>
              <span className="text-xs text-muted-foreground">Generates a branded PDF, seals it as {slug}, and anchors it.</span>
            </div>
          </div>

          {last && (
            <div className="mt-4 rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Issued to {last.recipientName}{last.emailed && <Badge variant="secondary" className="gap-1 text-[10px]"><Mail className="h-3 w-3" />emailed</Badge>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input readOnly value={last.proofUrl} className="h-8 text-xs" />
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(last.proofUrl); toast.success("Verify link copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
                <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0"><a href={last.proofUrl} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="batch" className="mt-4">
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">
              Paste CSV with a header row. Columns: <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">recipientName,recipientEmail,title,credType,credentialCode,expiresOn</code>
              (only <b>recipientName</b> and <b>title</b> are required).
            </p>
            <textarea
              value={csv} onChange={(e) => setCsv(e.target.value)}
              rows={8} spellCheck={false}
              className="mt-3 w-full rounded-lg border bg-background p-3 font-mono text-xs"
              placeholder={"recipientName,recipientEmail,title,credType,expiresOn\nJane Smith,jane@ex.com,Advanced First Aid,CPD Certificate,2027-06-01\nAli Khan,,Fire Safety,Training Certificate,"}
            />
            <Button onClick={issueBatch} disabled={batchBusy} className="mt-3 gap-1.5">
              {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />} Issue batch
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Issued ({initial.length})</h2>
        {initial.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No credentials issued yet.</div>
        ) : (
          <div className="divide-y rounded-lg border">
            {initial.map((c) => {
              const revoked = !!c.revokedAt;
              const expired = !revoked && c.expiresOn && new Date(c.expiresOn) < new Date();
              const url = c.sha256 ? `${appUrl}/d/${c.sha256}` : `${appUrl}/d/${c.id}`;
              return (
                <div key={c.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.recipientName}</span>
                      {revoked ? <Badge variant="destructive" className="text-[10px]">Revoked</Badge>
                        : expired ? <Badge variant="secondary" className="text-[10px]">Expired</Badge>
                        : <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.credType} · {c.title} · {new Date(c.issuedOn).toLocaleDateString()}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Copy verify link"
                            onClick={() => { navigator.clipboard.writeText(url); toast.success("Verify link copied"); }}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Open proof"><a href={url} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                    {!revoked && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Revoke" onClick={() => revoke(c)}><Ban className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1.5 block text-xs">{label}</Label>{children}</div>;
}

function parseCsv(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => l.match(/(".*?"|[^,]*)(,|$)/g)?.slice(0, -1).map((s) => s.replace(/,$/, "").replace(/^"|"$/g, "").trim()) ?? [];
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const o: any = {};
    header.forEach((h, i) => { if (h) o[h] = cells[i] ?? ""; });
    return o;
  });
}
