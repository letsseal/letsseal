"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, Baseline, Calendar, CheckSquare, ChevronDown, Contact, ExternalLink,
  GripVertical, ListOrdered, Loader2, Mail, MousePointer2, PenLine, Plus, Trash2, Type, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field as FormField } from "@/components/common/field";
import { Dropzone } from "@/components/common/dropzone";
import { CopyButton } from "@/components/common/copy-button";
import { PageHeader } from "@/components/common/page-header";
import { cn } from "@/lib/utils";
import PdfCanvas, { FieldBox } from "./PdfCanvas";
import { recipientColor, FIELD_TYPES, RECIPIENT_ROLES, roleMeta, isSigningRole, reorderMap, reorder } from "@/lib/signers";

type Signer = { name: string; email: string; role: string; accessCode: string; title: string; department: string; more?: boolean };
type SentSigner = { name: string; email: string | null; role: string; order: number; accessCode: string | null; emailed: boolean; status: string; link: string | null };
type Field = FieldBox & { id: string };

const PALETTE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  signature: PenLine, initials: Baseline, date: Calendar, text: Type, checkbox: CheckSquare,
};

const blankSigner = (): Signer => ({ name: "", email: "", role: "signer", accessCode: "", title: "", department: "" });

const genId = () => (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12);

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable
    || !!el.closest?.('[role="combobox"],[role="listbox"]');
}

const Dot = ({ index, className }: { index: number; className?: string }) => (
  <span className={cn("size-2.5 shrink-0 rounded-full", className)} style={{ background: recipientColor(index).solid }} />
);

export default function Builder({
  slug, orgName, existingEnvelopeId,
}: { slug: string; orgName: string; brandColor: string; existingEnvelopeId: string | null }) {
  const [envelopeId, setEnvelopeId] = useState<string | null>(existingEnvelopeId);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [signers, setSigners] = useState<Signer[]>([blankSigner()]);
  const [sequential, setSequential] = useState(false);
  const [armedType, setArmedType] = useState<string | null>(null);
  const [activeSigner, setActiveSigner] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentSigner[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
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
        ? env.signers.map((s: any) => ({ name: s.name, email: s.email ?? "", role: s.role ?? "signer", accessCode: s.accessCode ?? "", title: s.title ?? "", department: s.department ?? "" }))
        : [blankSigner()];
      setSigners(sList);
      const idOf = (sid: string | null) => env.signers?.findIndex((s: any) => s.id === sid);
      setFields((env.fields ?? []).map((f: any) => ({
        id: f.id, type: f.type, label: f.label ?? undefined, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
        signerIndex: Math.max(0, idOf(f.signerId) ?? 0),
        required: f.required !== false,
      })));
    })();
  }, [existingEnvelopeId]);

  async function handleUpload(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { toast.error("Choose a PDF."); return; }
    setUploading(true);
    const named = title.trim() || titleFromFilename(file.name) || "Untitled document";
    setTitle(named);
    const form = new FormData();
    form.append("orgSlug", slug); form.append("title", named); form.append("file", file);
    const res = await fetch("/api/envelopes", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) { toast.error((await res.json()).error ?? "Upload failed"); return; }
    const { id } = await res.json();
    setEnvelopeId(id);
    setFileUrl(`/api/file/${id}?t=${Date.now()}`);
    toast.success("PDF uploaded");
  }

  const place = useCallback((page: number, x: number, y: number) => {
    if (!armedType) return;
    if (!isSigningRole(signers[activeSigner]?.role ?? "signer")) { toast.error("This recipient only receives a copy — switch to a signer to place fields."); return; }
    const [w, h] = FIELD_TYPES.find((f) => f.type === armedType)!.size;
    const id = genId();
    setFields((p) => [...p, { id, type: armedType, page, x, y, w, h, signerIndex: activeSigner, required: true }]);
    setSelectedId(id);
  }, [armedType, activeSigner, signers]);

  const patch = (id: string, p: Partial<Field>) => setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...p } : f));
  const patchSigner = (i: number, p: Partial<Signer>) => setSigners((prev) => prev.map((x, j) => j === i ? { ...x, ...p } : x));

  async function send() {
    if (!envelopeId) return;
    if (!title.trim()) { toast.error("Give the document a title."); return; }
    if (signers.some((s) => !s.name.trim())) { toast.error("Every recipient needs a name."); return; }
    if (!signers.some((s) => isSigningRole(s.role))) { toast.error("Add at least one signer."); return; }
    if (fields.length === 0) { toast.error("Place at least one field on the document."); return; }
    setSending(true);
    const payload = {
      title: title.trim() || undefined,
      message: message.trim() || undefined,
      sequential,
      signers: signers.map((s) => ({ name: s.name, email: s.email || undefined, role: s.role, accessCode: s.accessCode || undefined, title: s.title || undefined, department: s.department || undefined })),
      fields: fields.map((f) => ({ type: f.type, label: f.label?.trim() || undefined, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, signerIndex: f.signerIndex ?? 0, required: f.required !== false })),
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
  const nameOf = (i: number) => signers[i]?.name.trim() || `Recipient ${i + 1}`;
  const activeSigning = isSigningRole(signers[activeSigner]?.role ?? "signer");

  function removeSigner(i: number) {
    setSigners((p) => p.filter((_, j) => j !== i));
    setFields((p) => p.filter((f) => f.signerIndex !== i)
                      .map((f) => ({ ...f, signerIndex: (f.signerIndex ?? 0) > i ? (f.signerIndex ?? 0) - 1 : f.signerIndex })));
    setActiveSigner((a) => (a > i ? a - 1 : a === i ? Math.max(0, i - 1) : a));
    if (selectedField?.signerIndex === i) setSelectedId(null);
  }

  function moveSigner(from: number, to: number) {
    if (from === to || to < 0 || to >= signers.length) return;
    const remap = reorderMap(signers.length, from, to);
    setSigners((p) => reorder(p, from, to));
    setFields((p) => p.map((f) => ({ ...f, signerIndex: remap.get(f.signerIndex ?? 0) ?? f.signerIndex })));
    setActiveSigner((a) => remap.get(a) ?? a);
  }

  function changeRole(i: number, role: string) {
    setSigners((p) => p.map((x, j) => (j === i ? { ...x, role } : x)));
    if (isSigningRole(role)) return;
    const lost = fieldCountFor(i);
    setFields((p) => p.filter((f) => f.signerIndex !== i));
    if (selectedField?.signerIndex === i) setSelectedId(null);
    if (lost) toast.warning(`${roleMeta(role).label} recipients don't sign, so their ${lost} placed field${lost > 1 ? "s were" : " was"} removed.`);
  }

  if (sent) return <SentView sent={sent} slug={slug} orgName={orgName} title={title} />;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href={`/${slug}`} aria-label={`Back to ${orgName}`}><ArrowLeft className="size-4" /></Link>
        </Button>
        <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{orgName}</span>
        <span className="hidden text-muted-foreground/50 sm:inline">/</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled document"
          aria-label="Document title"
          className="h-8 w-72 min-w-0 border-transparent bg-transparent px-2 font-medium shadow-none hover:border-input focus-visible:border-foreground/40"
        />
        <div className="flex-1" />
        {fileUrl && (
          <Button onClick={send} disabled={sending}>
            {sending && <Loader2 className="animate-spin" />}
            {sending ? "Sending…" : "Send"}
          </Button>
        )}
      </header>

      {!fileUrl ? (
        <div className="flex flex-1 items-center justify-center bg-muted p-8">
          <Dropzone
            size="lg"
            accept="application/pdf"
            busy={uploading}
            title="Upload a PDF to start"
            onFiles={([f]) => f && handleUpload(f)}
            className="max-w-xl"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r bg-background">
            <Section title="Recipients">
              {signers.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="signing-order" className="font-normal">Set signing order</Label>
                  <Switch id="signing-order" checked={sequential} onCheckedChange={setSequential} />
                </div>
              )}
              {signers.map((s, i) => {
                const active = activeSigner === i;
                const signing = isSigningRole(s.role);
                const count = fieldCountFor(i);
                const canCode = signing && !s.email;
                const open = s.more || !!(s.title || s.department || (canCode && s.accessCode));
                return (
                  <div
                    key={i}
                    onClick={() => setActiveSigner(i)}
                    onFocusCapture={() => setActiveSigner(i)}
                    onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) moveSigner(dragFrom, i);
                      setDragFrom(null); setDragOver(null);
                    }}
                    className={cn(
                      "grid cursor-pointer gap-2 rounded-lg border bg-card p-3 transition-colors",
                      active ? "border-foreground/40" : "hover:border-foreground/20",
                      dragOver === i && dragFrom !== null && dragFrom !== i && "border-dashed border-foreground/40",
                      dragFrom === i && "opacity-50",
                    )}
                  >
                    <div className="flex h-7 items-center gap-2">
                      {signers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          draggable
                          onDragStart={() => { setDragFrom(i); setDragOver(i); }}
                          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); moveSigner(i, i - 1); }
                            if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); moveSigner(i, i + 1); }
                          }}
                          title={sequential ? "Drag to reorder, or use the arrow keys" : "Drag to reorder"}
                          aria-label={`Reorder ${s.name.trim() || `recipient ${i + 1}`}, position ${i + 1} of ${signers.length}`}
                          className="-ml-1.5 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical />
                        </Button>
                      )}
                      {sequential && signing && <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>}
                      <Dot index={i} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(i)}</span>
                      {signing && <span className="shrink-0 text-xs text-muted-foreground">{count} field{count === 1 ? "" : "s"}</span>}
                      {signers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${nameOf(i)}`}
                          onClick={(e) => { e.stopPropagation(); removeSigner(i); }}
                          className="-mr-1.5 hover:text-destructive"
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                    <Input aria-label="Name" placeholder="Full name" value={s.name} className="h-8"
                           onChange={(e) => patchSigner(i, { name: e.target.value })} />
                    <Input aria-label="Email" type="email" placeholder={signing ? "Email (blank = in-person)" : "Email"} value={s.email} className="h-8"
                           onChange={(e) => patchSigner(i, { email: e.target.value })} />
                    <Select value={s.role} onValueChange={(v) => changeRole(i, v)}>
                      <SelectTrigger size="sm" aria-label="Role" className="h-8 w-full rounded-md shadow-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPIENT_ROLES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {open ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Input aria-label="Title" placeholder="Title" value={s.title} className="h-8"
                                 onChange={(e) => patchSigner(i, { title: e.target.value })} />
                          <Input aria-label="Department" placeholder="Department" value={s.department} className="h-8"
                                 onChange={(e) => patchSigner(i, { department: e.target.value })} />
                        </div>
                        {canCode && (
                          <Input aria-label="Access code" placeholder="Access code" value={s.accessCode} className="h-8"
                                 onChange={(e) => patchSigner(i, { accessCode: e.target.value })} />
                        )}
                      </>
                    ) : (
                      <Button type="button" variant="ghost" size="xs" className="-ml-2 w-fit"
                              onClick={(e) => { e.stopPropagation(); patchSigner(i, { more: true }); }}>
                        <ChevronDown /> More
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full"
                      onClick={() => { setSigners((p) => [...p, blankSigner()]); setActiveSigner(signers.length); setArmedType(null); }}>
                <Plus /> Add recipient
              </Button>
            </Section>

            <Separator />

            <Section
              title="Fields"
              aside={<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><Dot index={activeSigner} className="size-2" /><span className="truncate">{nameOf(activeSigner)}</span></span>}
            >
              {activeSigning ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {FIELD_TYPES.map((ft) => {
                      const Icon = PALETTE_ICON[ft.type];
                      const armed = armedType === ft.type;
                      return (
                        <Button
                          key={ft.type}
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-pressed={armed}
                          onClick={() => setArmedType(armed ? null : ft.type)}
                          className={cn("justify-start", armed && "border-foreground bg-accent text-foreground")}
                        >
                          <Icon /> {ft.label}
                        </Button>
                      );
                    })}
                  </div>
                  {armedType && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MousePointer2 className="mt-px size-3.5 shrink-0" />
                      Click the document to place it. Press Esc to stop.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This recipient doesn&apos;t sign, so there are no fields to place.</p>
              )}
            </Section>

            {selectedField && (
              <>
                <Separator />
                <Section title="Selected field">
                  <FormField label="Label" htmlFor="field-label">
                    <Input
                      id="field-label"
                      value={selectedField.label ?? ""}
                      placeholder={FIELD_TYPES.find((t) => t.type === selectedField.type)?.label ?? "Label"}
                      onChange={(e) => patch(selectedField.id, { label: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Assigned to" htmlFor="field-signer">
                    <Select value={String(selectedField.signerIndex ?? 0)} onValueChange={(v) => patch(selectedField.id, { signerIndex: Number(v) })}>
                      <SelectTrigger id="field-signer" className="h-9 w-full rounded-md shadow-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {signers.map((s, i) => ({ s, i })).filter(({ s }) => isSigningRole(s.role)).map(({ i }) => (
                          <SelectItem key={i} value={String(i)}><Dot index={i} className="size-2" />{nameOf(i)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="field-required">Required</Label>
                      <Switch id="field-required" checked={selectedField.required !== false}
                              onCheckedChange={(v) => patch(selectedField.id, { required: v })} />
                    </div>
                  </FormField>
                  <Button variant="ghost" size="sm" className="-ml-3 w-fit text-destructive hover:text-destructive"
                          onClick={() => { setFields((p) => p.filter((f) => f.id !== selectedField.id)); setSelectedId(null); }}>
                    <Trash2 /> Remove field
                  </Button>
                </Section>
              </>
            )}

            <Separator />

            <Section title="Message" aside={<span className="text-xs text-muted-foreground">Optional</span>}>
              <Textarea
                aria-label="Message to recipients"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Included in the signing email"
                rows={4}
                className="min-h-24"
              />
            </Section>
          </aside>

          <main className="flex-1 overflow-y-auto bg-muted p-8">
            <div className="mx-auto max-w-3xl">
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

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="shrink-0 text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SentView({ sent, slug, orgName, title }: { sent: SentSigner[]; slug: string; orgName: string; title: string }) {
  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-xl">
        <PageHeader title="Sent for signing" description={title} className="pb-6" />
        <div className="grid gap-3">
          {sent.map((s, i) => (
            <Card key={i} size="sm">
              <CardContent className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Dot index={i} />
                  <span className="min-w-0 truncate font-medium">{s.name}</span>
                  <Badge variant="outline" className="ml-auto">{roleMeta(s.role).label}</Badge>
                </div>
                {(s.email || s.accessCode) && (
                  <div className="-mt-2 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    {s.email && <span className="truncate">{s.email}</span>}
                    {s.accessCode && <span>Access code <span className="font-mono text-foreground">{s.accessCode}</span></span>}
                  </div>
                )}
                {s.status === "emailed" ? (
                  <Note icon={Mail}>Invite emailed</Note>
                ) : s.status === "in_person" ? (
                  <div className="flex items-center gap-2">
                    <Button asChild className="flex-1">
                      <a href={s.link!}><Contact /> Hand device to {s.name.split(" ")[0] || "signer"}</a>
                    </Button>
                    <CopyButton value={s.link!} size="icon" toastMessage="Link copied" />
                  </div>
                ) : s.status === "queued" ? (
                  <Note icon={ListOrdered}>Invited automatically when earlier signers finish.</Note>
                ) : s.status === "copy" ? (
                  <Note icon={Mail}>{s.email ? "Gets the completed document by email." : "Receives a copy of the completed document."}</Note>
                ) : (
                  <>
                    <Alert variant="warning">
                      <AlertTriangle />
                      <AlertTitle>Email not sent</AlertTitle>
                      <AlertDescription>Share this link with them yourself. It&apos;s weaker evidence than an email invite.</AlertDescription>
                    </Alert>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={s.link!} aria-label="Signing link" className="h-8 font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <CopyButton value={s.link!} toastMessage="Link copied" />
                      <Button asChild size="icon-sm" variant="outline">
                        <a href={s.link!} target="_blank" rel="noreferrer" aria-label="Open signing link"><ExternalLink /></a>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <Button asChild variant="ghost" className="mt-6 -ml-4">
          <Link href={`/${slug}`}><ArrowLeft /> Back to {orgName}</Link>
        </Button>
      </div>
    </div>
  );
}

function Note({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-3.5 shrink-0" /> {children}
    </p>
  );
}
