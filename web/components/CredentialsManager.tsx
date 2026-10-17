"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Award, ExternalLink, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/common/field";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";

type Cred = {
  id: string; recipientName: string; recipientEmail: string | null; credType: string;
  title: string; credentialCode: string | null; issuedOn: string; expiresOn: string | null;
  sha256: string | null; revokedAt: string | null;
};

const TYPES = ["Certificate of Completion", "Certificate of Achievement", "CPD Certificate",
  "Professional Licence", "Insurance Certificate", "Membership", "Training Certificate"];

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CredentialsManager({
  slug, orgName, initial, appUrl,
}: { slug: string; orgName: string; initial: Cred[]; appUrl: string }) {
  const router = useRouter();
  const [f, setF] = useState({ recipientName: "", recipientEmail: "", credType: TYPES[0], title: "", credentialCode: "", issuedOn: todayISO(), expiresOn: "", description: "" });
  const [issuing, setIssuing] = useState(false);
  const [last, setLast] = useState<{ proofUrl: string; recipientName: string; emailed: boolean } | null>(null);
  const [csv, setCsv] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [revoking, setRevoking] = useState<Cred | null>(null);
  const [reason, setReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function issue() {
    if (!f.recipientName.trim() || !f.title.trim()) { toast.error("Add a recipient name and credential title"); return; }
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
      toast.success(`Issued to ${f.recipientName}${r.emailed ? " and emailed" : ""}`);
      setF((p) => ({ ...p, recipientName: "", recipientEmail: "", title: "", credentialCode: "", expiresOn: "", description: "" }));
      router.refresh();
    } finally { setIssuing(false); }
  }

  async function issueBatch() {
    const rows = parseCsv(csv);
    if (rows.length === 0) { toast.error("No rows found. Check the header row."); return; }
    setBatchBusy(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/credentials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: rows }),
      });
      const data = await res.json();
      if (!res.ok && !data.issued) { toast.error(data.error ?? "Batch failed"); return; }
      toast.success(`Issued ${data.issued} of ${data.total}`);
      if (data.issued < data.total) toast.error(`${data.total - data.issued} row(s) failed. Check names and titles.`);
      setCsv("");
      router.refresh();
    } finally { setBatchBusy(false); }
  }

  function askRevoke(c: Cred) {
    setReason("");
    setRevoking(c);
  }

  async function revoke() {
    if (!revoking || revokeBusy) return;
    setRevokeBusy(true);
    try {
      const res = await fetch(`/api/orgs/${slug}/credentials/${revoking.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) { toast.error("Could not revoke"); return; }
      toast.success("Credential revoked");
      setRevoking(null);
      router.refresh();
    } finally { setRevokeBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-10">
      <Tabs defaultValue="one" className="gap-4">
        <TabsList>
          <TabsTrigger value="one">One credential</TabsTrigger>
          <TabsTrigger value="batch">Batch from CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="one" className="space-y-4">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name" htmlFor="cred-name">
                <Input id="cred-name" value={f.recipientName} onChange={set("recipientName")} placeholder="Jane Smith" />
              </Field>
              <Field label="Recipient email" htmlFor="cred-email" optional hint="We'll email them the proof link.">
                <Input id="cred-email" type="email" value={f.recipientEmail} onChange={set("recipientEmail")} placeholder="jane@example.com" />
              </Field>
              <Field label="Type" htmlFor="cred-type">
                <Input id="cred-type" list="cred-types" value={f.credType} onChange={set("credType")} />
                <datalist id="cred-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
              </Field>
              <Field label="Credential title" htmlFor="cred-title">
                <Input id="cred-title" value={f.title} onChange={set("title")} placeholder="Advanced First Aid" />
              </Field>
              <Field label="Reference" htmlFor="cred-code" optional>
                <Input id="cred-code" value={f.credentialCode} onChange={set("credentialCode")} placeholder="CERT-2026-0481" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Issued on" htmlFor="cred-issued">
                  <Input id="cred-issued" type="date" value={f.issuedOn} onChange={set("issuedOn")} />
                </Field>
                <Field label="Expires" htmlFor="cred-expires" optional>
                  <Input id="cred-expires" type="date" value={f.expiresOn} onChange={set("expiresOn")} />
                </Field>
              </div>
              <Field label="Details" htmlFor="cred-details" optional className="sm:col-span-2">
                <Textarea id="cred-details" value={f.description} onChange={set("description")} placeholder="Completed 16 hours of assessed training." />
              </Field>
            </CardContent>
            <CardFooter className="justify-between">
              <p className="text-sm text-muted-foreground">Creates a branded PDF sealed as {orgName}.</p>
              <Button onClick={issue} disabled={issuing}>
                {issuing && <Loader2 className="animate-spin" />} Issue credential
              </Button>
            </CardFooter>
          </Card>

          {last && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertTitle>Issued to {last.recipientName}{last.emailed && " and emailed"}</AlertTitle>
              <AlertDescription>
                <div className="mt-1 flex w-full items-center gap-2">
                  <Input readOnly value={last.proofUrl} aria-label="Proof link" className="h-8 font-mono text-xs" />
                  <CopyButton value={last.proofUrl} ariaLabel="Copy proof link" toastMessage="Proof link copied" />
                  <Button asChild size="icon-sm" variant="outline">
                    <a href={last.proofUrl} target="_blank" rel="noreferrer" aria-label="Open proof"><ExternalLink /></a>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="batch">
          <Card>
            <CardContent>
              <Field
                label="CSV"
                htmlFor="cred-csv"
                hint={<>Include a header row. <span className="font-mono text-xs">recipientName</span> and <span className="font-mono text-xs">title</span> are required; <span className="font-mono text-xs">recipientEmail</span>, <span className="font-mono text-xs">credType</span>, <span className="font-mono text-xs">credentialCode</span> and <span className="font-mono text-xs">expiresOn</span> are optional.</>}
              >
                <Textarea
                  id="cred-csv"
                  value={csv} onChange={(e) => setCsv(e.target.value)}
                  spellCheck={false}
                  className="min-h-40 font-mono text-xs md:text-xs"
                  placeholder={"recipientName,recipientEmail,title,credType,expiresOn\nJane Smith,jane@ex.com,Advanced First Aid,CPD Certificate,2027-06-01\nAli Khan,,Fire Safety,Training Certificate,"}
                />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={issueBatch} disabled={batchBusy}>
                {batchBusy && <Loader2 className="animate-spin" />} Issue credentials
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">Issued</h2>
          {initial.length > 0 && <Badge variant="secondary">{initial.length}</Badge>}
        </div>
        {initial.length === 0 ? (
          <EmptyState icon={Award} title="No credentials yet" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Recipient</TableHead>
                  <TableHead className="hidden md:table-cell">Credential</TableHead>
                  <TableHead className="hidden sm:table-cell">Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initial.map((c) => {
                  const revoked = !!c.revokedAt;
                  const expired = !revoked && c.expiresOn && new Date(c.expiresOn) < new Date();
                  const url = c.sha256 ? `${appUrl}/d/${c.sha256}` : `${appUrl}/d/${c.id}`;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-48">
                        <p className="truncate font-medium">{c.recipientName}</p>
                        {c.recipientEmail && <p className="truncate text-xs text-muted-foreground">{c.recipientEmail}</p>}
                      </TableCell>
                      <TableCell className="hidden max-w-64 md:table-cell">
                        <p className="truncate">{c.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.credType}</p>
                      </TableCell>
                      <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                        {new Date(c.issuedOn).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {revoked ? <StatusBadge tone="destructive">Revoked</StatusBadge>
                          : expired ? <StatusBadge tone="warning">Expired</StatusBadge>
                          : <StatusBadge tone="success">Active</StatusBadge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <CopyButton value={url} variant="ghost" ariaLabel="Copy proof link" toastMessage="Proof link copied" />
                          <Button asChild size="icon-sm" variant="ghost">
                            <a href={url} target="_blank" rel="noreferrer" aria-label="Open proof"><ExternalLink /></a>
                          </Button>
                          {!revoked && (
                            <Button size="icon-sm" variant="ghost" className="hover:text-destructive" aria-label="Revoke" onClick={() => askRevoke(c)}>
                              <Ban />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={!!revoking} onOpenChange={(o) => { if (!o && !revokeBusy) setRevoking(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke credential?</DialogTitle>
            <DialogDescription>
              {revoking && <>“{revoking.title}” issued to {revoking.recipientName}. Its proof link will show it as Revoked.</>}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="revoke-reason" optional>
            <Input id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") revoke(); }} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={revokeBusy}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={revoke} disabled={revokeBusy}>
              {revokeBusy && <Loader2 className="animate-spin" />} Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
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
