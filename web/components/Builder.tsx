"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Plus, Trash2, PenLine, Type, Calendar, CheckSquare,
  Baseline, Users, MousePointer2, Check, Copy, ExternalLink, FileText, Loader2, Contact, Mail, AlertTriangle,
  Settings2, MessageSquare, ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PdfCanvas, { FieldBox } from "./PdfCanvas";
import { recipientColor, FIELD_TYPES, RECIPIENT_ROLES, roleMeta, isSigningRole } from "@/lib/signers";

type Signer = { name: string; email: string; role: string; accessCode: string };
type SentSigner = { name: string; email: string | null; role: string; order: number; accessCode: string | null; emailed: boolean; status: string; link: string | null };
type Field = FieldBox & { id: string };

const PALETTE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  signature: PenLine, initials: Baseline, date: Calendar, text: Type, checkbox: CheckSquare,
};

const genId = () => (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12);

export default function Builder({
  slug, orgName, brandColor, existingEnvelopeId,
}: { slug: string; orgName: string; brandColor: string; existingEnvelopeId: string | null }) {
  const [envelopeId, setEnvelopeId] = useState<string | null>(existingEnvelopeId);
  const [title, setTitle] = useState("Untitled document");
  const [message, setMessage] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [signers, setSigners] = useState<Signer[]>([{ name: "", email: "", role: "signer", accessCode: "" }]);
  const [sequential, setSequential] = useState(false);
  const [armedType, setArmedType] = useState<string | null>(null);
  const [activeSigner, setActiveSigner] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentSigner[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setArmedType(null); setSelectedId(null); }
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        setFields((p) => p.filter((f) => f.id !== selectedId)); setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!existingEnvelopeId) return;
    (async () => {
      const res = await fetch(`/api/envelopes/${existingEnvelopeId}`);
      if (!res.ok) return;
      const env = await res.json();
      setTitle(env.title);
      setMessage(env.message ?? "");
      setSequential(!!env.sequential);
      setFileUrl(`/api/file/${existingEnvelopeId}?t=${Date.now()}`);
      const sList: Signer[] = env.signers?.length
        ? env.signers.map((s: any) => ({ name: s.name, email: s.email ?? "", role: s.role ?? "signer", accessCode: s.accessCode ?? "" }))
        : [{ name: "", email: "", role: "signer", accessCode: "" }];
      setSigners(sList);
      const idOf = (sid: string | null) => env.signers?.findIndex((s: any) => s.id === sid);
      setFields((env.fields ?? []).map((f: any) => ({
        id: f.id, type: f.type, label: f.label ?? undefined, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
        signerIndex: Math.max(0, idOf(f.signerId) ?? 0),
      })));
    })();
  }, [existingEnvelopeId]);

  async function handleUpload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("orgSlug", slug); form.append("title", title); form.append("file", file);
    const res = await fetch("/api/envelopes", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Upload failed"); return; }
    const { id } = await res.json();
    setEnvelopeId(id);
    setFileUrl(`/api/file/${id}?t=${Date.now()}`);
    toast.success("PDF uploaded — place your fields");
  }

  const place = useCallback((page: number, x: number, y: number) => {
    if (!armedType) return;
    // cc / viewer recipients don't sign, so they can't own fields.
    if (!isSigningRole(signers[activeSigner]?.role ?? "signer")) { toast.error("This recipient only receives a copy — switch to a signer to place fields."); return; }
    const [w, h] = FIELD_TYPES.find((f) => f.type === armedType)!.size;
    const id = genId();
    setFields((p) => [...p, { id, type: armedType, page, x, y, w, h, signerIndex: activeSigner }]);
    setSelectedId(id);
  }, [armedType, activeSigner, signers]);

  const patch = (id: string, p: Partial<Field>) => setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...p } : f));

  async function send() {
    if (!envelopeId) return;
    if (signers.some((s) => !s.name.trim())) { toast.error("Every recipient needs a name."); return; }
    if (!signers.some((s) => isSigningRole(s.role))) { toast.error("Add at least one signer (Needs to Sign or In-Person)."); return; }
    if (fields.length === 0) { toast.error("Place at least one field on the document."); return; }
    setSending(true);
    const payload = {
      message: message.trim() || undefined,
      sequential,
      signers: signers.map((s) => ({ name: s.name, email: s.email || undefined, role: s.role, accessCode: s.accessCode || undefined })),
      fields: fields.map((f) => ({ type: f.type, label: f.label?.trim() || undefined, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, signerIndex: f.signerIndex ?? 0 })),
    };
    const res = await fetch(`/api/envelopes/${envelopeId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setSending(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Send failed"); return; }
    setSent((await res.json()).signers);
  }

  const fieldCountFor = (i: number) => fields.filter((f) => f.signerIndex === i).length;
  const selectedField = fields.find((f) => f.id === selectedId) ?? null;

  // Changing a recipient to a non-signing role (cc / viewer) drops their fields.
  function changeRole(i: number, role: string) {
    setSigners((p) => p.map((x, j) => (j === i ? { ...x, role } : x)));
    if (!isSigningRole(role)) { setFields((p) => p.filter((f) => f.signerIndex !== i)); if (selectedField?.signerIndex === i) setSelectedId(null); }
  }

  if (sent) return <SentView sent={sent} slug={slug} orgName={orgName} title={title} envelopeId={envelopeId!} />;

  return (
    <div className="flex flex-col h-screen bg-secondary">
      <header className="flex items-center gap-3 px-4 h-14 bg-white border-b shrink-0">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href={`/${slug}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input value={title} onChange={(e) => setTitle(e.target.value)}
                 className="h-8 border-transparent hover:border-input focus-visible:border-input font-medium w-64" />
        </div>
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <span className="h-2 w-2 rounded-full" style={{ background: brandColor }} />{orgName}
        </Badge>
        <div className="flex-1" />
        {fileUrl && (
          <Button onClick={send} disabled={sending} style={{ background: brandColor }} className="gap-2 text-white">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sealing…" : "Send"}
          </Button>
        )}
      </header>

      {!fileUrl ? (
        <UploadZone uploading={uploading} onFile={handleUpload} />
      ) : (
        <div className="flex flex-1 min-h-0">
          <aside className="w-72 bg-white border-r flex flex-col shrink-0 overflow-y-auto">
            <Section icon={<Users className="h-3.5 w-3.5" />} title="Recipients">
              {signers.length > 1 && (
                <button type="button" onClick={() => setSequential((v) => !v)}
                        className={`flex items-center gap-2 w-full rounded-md border px-2.5 py-2 mb-3 text-xs transition ${sequential ? "border-primary/40 bg-primary/5 text-foreground" : "hover:bg-secondary text-muted-foreground"}`}>
                  <ListOrdered className="h-3.5 w-3.5" />
                  <span className="font-medium">Set signing order</span>
                  <span className={`ml-auto relative h-4 w-7 rounded-full transition ${sequential ? "bg-primary" : "bg-input"}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${sequential ? "left-[14px]" : "left-0.5"}`} />
                  </span>
                </button>
              )}
              {signers.map((s, i) => {
                const c = recipientColor(i);
                const active = activeSigner === i;
                const signing = isSigningRole(s.role);
                return (
                  <div key={i}
                       className={`rounded-lg border p-2.5 mb-2 cursor-pointer transition ${active ? "ring-2" : "hover:bg-secondary"}`}
                       style={{ borderColor: active ? c.border : undefined, ...(active ? { ["--tw-ring-color" as any]: c.border } : {}) }}
                       onClick={() => setActiveSigner(i)}>
                    <div className="flex items-center gap-2 mb-2">
                      {sequential && signing && (
                        <span className="h-4 w-4 rounded-full text-[10px] font-semibold text-white flex items-center justify-center shrink-0" style={{ background: c.solid }}>{i + 1}</span>
                      )}
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ background: c.solid }} />
                      <span className="text-xs font-medium text-muted-foreground truncate">{roleMeta(s.role).label}</span>
                      {signing && <span className="text-[10px] ml-auto text-muted-foreground shrink-0">{fieldCountFor(i)} fields</span>}
                      {signers.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); setSigners((p) => p.filter((_, j) => j !== i)); setFields((p) => p.filter((f) => f.signerIndex !== i).map((f) => ({ ...f, signerIndex: (f.signerIndex ?? 0) > i ? (f.signerIndex ?? 0) - 1 : f.signerIndex }))); if (activeSigner >= signers.length - 1) setActiveSigner(0); }}
                                className={`text-muted-foreground hover:text-destructive shrink-0 ${signing ? "" : "ml-auto"}`}><Trash2 className="h-3 w-3" /></button>
                      )}
                    </div>
                    <Input placeholder="Full name" value={s.name}
                           onClick={(e) => e.stopPropagation()}
                           onChange={(e) => setSigners((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                           className="h-8 text-sm mb-1.5" />
                    <Input placeholder={signing ? "Email (blank = in-person)" : "Email"} value={s.email}
                           onClick={(e) => e.stopPropagation()}
                           onChange={(e) => setSigners((p) => p.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                           className="h-8 text-sm" />
                    <select value={s.role} onClick={(e) => e.stopPropagation()}
                            onChange={(e) => changeRole(i, e.target.value)}
                            className="mt-1.5 h-8 w-full rounded-md border border-input bg-white px-2 text-xs text-foreground">
                      {RECIPIENT_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    {signing && !s.email && (
                      <Input placeholder="Access code (optional)" value={s.accessCode}
                             onClick={(e) => e.stopPropagation()}
                             onChange={(e) => setSigners((p) => p.map((x, j) => j === i ? { ...x, accessCode: e.target.value } : x))}
                             className="h-7 text-xs mt-1.5" />
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1"
                      onClick={() => { setSigners((p) => [...p, { name: "", email: "", role: "signer", accessCode: "" }]); setActiveSigner(signers.length); setArmedType(null); }}>
                <Plus className="h-3.5 w-3.5" /> Add recipient
              </Button>
            </Section>

            <Separator />

            <Section icon={<PenLine className="h-3.5 w-3.5" />} title="Fields"
                     hint={`for ${signers[activeSigner]?.name?.trim() || `Recipient ${activeSigner + 1}`}`}>
              {isSigningRole(signers[activeSigner]?.role ?? "signer") ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {FIELD_TYPES.map((ft) => {
                      const Icon = PALETTE_ICON[ft.type];
                      const armed = armedType === ft.type;
                      const c = recipientColor(activeSigner);
                      return (
                        <button key={ft.type}
                                onClick={() => setArmedType(armed ? null : ft.type)}
                                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition ${armed ? "text-white shadow-sm" : "hover:bg-secondary text-neutral-700"}`}
                                style={armed ? { background: c.solid, borderColor: c.solid } : {}}>
                          <Icon className="h-4 w-4" />
                          {ft.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-secondary p-2.5">
                    <MousePointer2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {armedType
                      ? "Move over the document — click to drop the field. Press Esc to stop."
                      : "Pick a field, then click the document to place it. Drag to move, corner to resize."}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground rounded-md bg-secondary p-3">
                  <b>{roleMeta(signers[activeSigner]?.role ?? "").label}</b> {roleMeta(signers[activeSigner]?.role ?? "").hint.toLowerCase()} — no fields to place. They&apos;ll receive the completed sealed copy by email.
                </div>
              )}
            </Section>

            {selectedField && (
              <>
                <Separator />
                <Section icon={<Settings2 className="h-3.5 w-3.5" />} title="Selected field">
                  <label className="text-xs font-medium text-muted-foreground">Label on the box</label>
                  <Input
                    value={selectedField.label ?? ""}
                    placeholder={FIELD_TYPES.find((t) => t.type === selectedField.type)?.label ?? "Label"}
                    onChange={(e) => patch(selectedField.id, { label: e.target.value })}
                    className="h-8 text-sm mt-1 mb-3"
                  />
                  <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
                  <select
                    value={selectedField.signerIndex ?? 0}
                    onChange={(e) => patch(selectedField.id, { signerIndex: Number(e.target.value) })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                  >
                    {signers.map((s, i) => ({ s, i })).filter(({ s }) => isSigningRole(s.role)).map(({ s, i }) => (
                      <option key={i} value={i}>
                        {s.name.trim() || `Recipient ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: recipientColor(selectedField.signerIndex ?? 0).solid }} />
                    This field is {recipientColor(selectedField.signerIndex ?? 0).name}
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-1.5 mt-3 text-destructive hover:text-destructive"
                          onClick={() => { setFields((p) => p.filter((f) => f.id !== selectedField.id)); setSelectedId(null); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove field
                  </Button>
                </Section>
              </>
            )}

            <Separator />

            <Section icon={<MessageSquare className="h-3.5 w-3.5" />} title="Message to recipients" hint="optional">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note — it appears in the signing invitation email."
                rows={4}
                className="w-full rounded-md border border-input bg-white px-2.5 py-2 text-sm resize-none focus-visible:outline-none focus-visible:border-primary"
              />
            </Section>
          </aside>

          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
              <PdfCanvas
                fileUrl={fileUrl} fields={fields} mode="build" docId={envelopeId ?? undefined}
                armedType={armedType} armedSignerIndex={activeSigner} selectedId={selectedId}
                onPlace={place} onSelect={setSelectedId}
                onMove={(id, x, y) => patch(id, { x, y })}
                onResize={(id, w, h) => patch(id, { w, h })}
                onDelete={(id) => { setFields((p) => p.filter((f) => f.id !== id)); setSelectedId(null); }}
              />
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {icon} {title}
        {hint && <span className="ml-auto normal-case tracking-normal font-normal text-muted-foreground truncate max-w-[120px]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function UploadZone({ uploading, onFile }: { uploading: boolean; onFile: (f: File) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-secondary">
      <label className="w-full max-w-xl">
        <input type="file" accept="application/pdf" className="hidden"
               onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="border-2 border-dashed rounded-2xl bg-white p-16 text-center cursor-pointer hover:border-input transition">
          {uploading ? (
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin" />
          ) : (
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
          )}
          <div className="mt-4 font-medium">{uploading ? "Uploading…" : "Upload a PDF to get started"}</div>
          <div className="text-sm text-muted-foreground mt-1">Drag a file here or click to browse</div>
        </div>
      </label>
    </div>
  );
}

function SentView({ sent, slug, orgName, title, envelopeId }: { sent: SentSigner[]; slug: string; orgName: string; title: string; envelopeId: string }) {
  return (
    <div className="min-h-screen bg-secondary py-16 px-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <span className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center"><Check className="h-5 w-5 text-green-600" /></span>
          <div>
            <h1 className="text-xl font-semibold">Envelope sent</h1>
            <p className="text-sm text-muted-foreground">{title} · {orgName}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4 mb-4">
          Emailed signers get their own unique link — keeping their signature attributable to them.
          In-person recipients sign on your device; copy/view recipients get the finished document.
        </p>
        <div className="space-y-3">
          {sent.map((s, i) => {
            const c = recipientColor(i);
            return (
              <div key={i} className="bg-white rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.solid }} />
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="secondary" className="ml-auto font-normal">{roleMeta(s.role).label}</Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{s.email || "no email — sign in person"}</div>
                {s.accessCode && <div className="text-xs text-muted-foreground mt-1">Access code: <b>{s.accessCode}</b></div>}
                {s.status === "emailed" ? (
                  // Link delivered to the signer's own inbox — deliberately not shown
                  // here, so the signature stays attributable to the counterparty.
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                    <Mail className="h-4 w-4" /> Signing invite emailed to {s.email}
                  </div>
                ) : s.status === "in_person" ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button asChild className="flex-1 gap-2 text-white" style={{ background: c.solid }}>
                      <a href={s.link!}><Contact className="h-4 w-4" /> Hand device to {s.name.split(" ")[0] || "signer"}</a>
                    </Button>
                    <Button size="icon" variant="outline" className="shrink-0"
                            onClick={() => { navigator.clipboard.writeText(s.link!); toast.success("Link copied"); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : s.status === "queued" ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <ListOrdered className="h-3.5 w-3.5 shrink-0" /> Waiting for their turn — invited automatically once earlier signers finish.
                  </div>
                ) : s.status === "copy" ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {s.email ? `Will receive the completed copy at ${s.email}` : "Receives a copy of the completed document"}
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Email not sent — share this link manually (weaker attribution).
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input readOnly value={s.link!} className="h-8 text-xs" />
                      <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"
                              onClick={() => { navigator.clipboard.writeText(s.link!); toast.success("Link copied — email it to them"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0">
                        <a href={s.link!} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <Button asChild variant="ghost" className="mt-8 gap-1.5">
          <Link href={`/${slug}`}><ArrowLeft className="h-4 w-4" /> Back to {orgName}</Link>
        </Button>
      </div>
    </div>
  );
}
