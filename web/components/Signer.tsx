"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Check, ChevronRight, Download, KeyRound, Link2Off, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dropzone } from "@/components/common/dropzone";
import { OrgAvatar } from "@/components/app-shell/OrgAvatar";
import { cn } from "@/lib/utils";
import PdfCanvas, { FieldBox } from "./PdfCanvas";
import { recipientColor, blockingFields } from "@/lib/signers";

const SIGNATURE_FONTS = [
  { name: "Dancing Script", css: "var(--font-sig-1), cursive" },
  { name: "Great Vibes", css: "var(--font-sig-2), cursive" },
  { name: "Caveat", css: "var(--font-sig-3), cursive" },
  { name: "Sacramento", css: "var(--font-sig-4), cursive" },
];
const INK = "#1f2937";

type ApiField = FieldBox & { mine: boolean; signerId: string | null; signerName: string | null };
type Data = {
  signer: { id: string; name: string; kind: string; status: string; hasAccessCode: boolean };
  envelope: {
    id: string; title: string; status: string;
    org: { name: string; brandColor: string };
    fields: ApiField[];
  };
};

export default function Signer({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [accessCode, setAccessCode] = useState("");
  const [editing, setEditing] = useState<FieldBox | null>(null);
  const [editingText, setEditingText] = useState<FieldBox | null>(null);
  const [done, setDone] = useState<null | { completed: boolean; sha256?: string; certCN?: string; anchorState?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adopted, setAdopted] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  async function load(code?: string) {
    const qs = code ? `?code=${encodeURIComponent(code)}` : "";
    const res = await fetch(`/api/sign/${token}${qs}`);
    if (!res.ok) { setError("This signing link is invalid or has expired. Ask the sender for a new one."); return false; }
    const body = await res.json();
    if (body.needsAccessCode) { setNeedsCode(true); setData(null); return false; }
    setNeedsCode(false);
    setData(body);
    return true;
  }

  useEffect(() => { void load(); }, [token]);

  async function unlock() {
    if (!accessCode.trim()) { toast.error("Enter your access code."); return; }
    setUnlocking(true);
    const ok = await load(accessCode.trim());
    setUnlocking(false);
    if (!ok && !error) toast.error("That access code didn't match. Check it and try again.");
  }

  const signerIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (data) for (const f of data.envelope.fields) {
      if (f.signerId && !map.has(f.signerId)) map.set(f.signerId, map.size);
    }
    return map;
  }, [data]);

  if (error) return <StateScreen icon={Link2Off} title="This link doesn't work" description={error} />;
  if (needsCode) return (
    <StateScreen icon={KeyRound} title="Enter your access code" description="The sender gave you a code to open this document.">
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
        <Input autoFocus aria-label="Access code" placeholder="Access code" value={accessCode}
               onChange={(e) => setAccessCode(e.target.value)} />
        <Button type="submit" disabled={unlocking}>
          {unlocking && <Loader2 className="animate-spin" />} Unlock
        </Button>
      </form>
    </StateScreen>
  );
  if (!data) return <Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>;
  if (data.signer.status === "signed" && !done)
    return <StateScreen icon={Check} tone="success" title="Already signed" description="You have already signed this document." />;

  const myIdx = signerIndex.get(data.signer.id) ?? 0;
  const myFields = data.envelope.fields
    .filter((f) => f.mine)
    .sort((a, b) => a.page - b.page || a.y - b.y);
  const mustFill = myFields.filter((f) => f.required !== false);
  const blocking = blockingFields(myFields, values);
  const filledCount = mustFill.length - blocking.length;
  const nextField = blocking[0];
  const allDone = blocking.length === 0;
  const brand = data.envelope.org.brandColor;

  const previewFields: FieldBox[] = data.envelope.fields.map((f) => ({
    ...f, value: f.mine ? values[f.id!] ?? null : f.value ?? null,
    signerIndex: f.signerId ? signerIndex.get(f.signerId) ?? 0 : 0,
  }));

  function fill(f: FieldBox, v: string) { setValues((p) => ({ ...p, [f.id!]: v })); }

  function activate(f: FieldBox) {
    if (f.type === "checkbox") return fill(f, values[f.id!] ? "" : "X");
    if (f.type === "date") return fill(f, new Date().toISOString().slice(0, 10));
    if (f.type === "text") return setEditingText(f);
    if (f.type === "signature" || f.type === "initials") {
      if (adopted) return fill(f, adopted);
      return setEditing(f);
    }
  }

  function goToNext() {
    if (!nextField) return;
    const el = document.querySelector(`[data-field-id="${nextField.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => activate(nextField), 400);
  }

  async function submit() {
    if (!allDone) { toast.error("Complete all required fields first."); return; }
    if (data!.signer.hasAccessCode && !accessCode) { toast.error("Enter your access code to finish."); return; }
    setSubmitting(true);
    const res = await fetch(`/api/sign/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, accessCode }),
    });
    setSubmitting(false);
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Could not submit your signature. Try again."); return; }
    setDone(body);
  }

  if (done) return <DoneView done={done} envelopeId={data.envelope.id} token={token} />;

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <OrgAvatar name={data.envelope.org.name} color={brand} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{data.envelope.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {data.envelope.org.name} · Signing as {data.signer.name}
            </p>
          </div>
          <Badge variant="secondary" className="hidden tabular-nums sm:inline-flex" aria-label={`${filledCount} of ${mustFill.length} required fields done`}>
            {filledCount}/{mustFill.length}
          </Badge>
          {data.signer.hasAccessCode && (
            <Input aria-label="Access code" placeholder="Access code" value={accessCode}
                   onChange={(e) => setAccessCode(e.target.value)} className="hidden w-32 sm:block" />
          )}
          <Button onClick={submit} disabled={submitting || !allDone}
                  className="text-brand-foreground hover:opacity-90" style={{ background: brand }}>
            {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {submitting ? "Signing…" : "Finish & sign"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 pb-24 sm:p-8 sm:pb-24">
        <PdfCanvas fileUrl={`/api/file/${data.envelope.id}?token=${token}${accessCode ? `&code=${encodeURIComponent(accessCode)}` : ""}`} fields={previewFields}
                   mode="sign" docId={data.envelope.id} activeSignerIndex={myIdx} pointerFieldId={nextField?.id ?? undefined}
                   onFieldClick={activate} />
      </main>

      <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        {allDone ? (
          <div className="rounded-full border border-success/25 bg-background shadow-sm">
            <div className="surface-success flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
              <Check className="size-4" /> All required fields complete
            </div>
          </div>
        ) : (
          <Button size="lg" onClick={goToNext} className="rounded-full shadow-sm animate-in fade-in slide-in-from-bottom-2">
            {filledCount === 0 ? "Start signing" : "Next field"} <ChevronRight />
          </Button>
        )}
      </div>

      {editing && (
        <SignatureDialog
          name={data.signer.name}
          isInitials={editing.type === "initials"}
          onClose={() => setEditing(null)}
          onAdopt={(dataUrl) => { setAdopted(dataUrl); fill(editing, dataUrl); setEditing(null); }}
        />
      )}
      {editingText && (
        <TextFieldDialog
          label={editingText.label || "Text"}
          initial={values[editingText.id!] ?? ""}
          onClose={() => setEditingText(null)}
          onSave={(v) => { fill(editingText, v); setEditingText(null); }}
        />
      )}
    </div>
  );
}

function TextFieldDialog({
  label, initial, onSave, onClose,
}: { label: string; initial: string; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onSave(value); }}>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <Input autoFocus aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SignatureDialog({
  name, isInitials, onAdopt, onClose,
}: { name: string; isInitials: boolean; onAdopt: (d: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const [tab, setTab] = useState("draw");
  const [typed, setTyped] = useState(name);
  const [fontIdx, setFontIdx] = useState(0);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const FONT = SIGNATURE_FONTS[fontIdx].css;

  async function ingestImage(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Choose a PNG or JPG image."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image is too large (max 5MB)."); return; }
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
    });
    setUploaded(url);
  }

  useEffect(() => {
    if (tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let pad: SignaturePad | null = null;
    const raf = requestAnimationFrame(() => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round((rect.width || 448) * ratio);
      canvas.height = Math.round((rect.height || 176) * ratio);
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad = new SignaturePad(canvas, { penColor: INK, minWidth: 1, maxWidth: 2.5 });
      padRef.current = pad;
    });
    return () => { cancelAnimationFrame(raf); pad?.off(); padRef.current = null; };
  }, [tab]);

  async function typedToDataUrl(): Promise<string> {
    const fam = previewRef.current ? getComputedStyle(previewRef.current).fontFamily : FONT;
    try { await (document as any).fonts?.load?.(`72px ${fam}`); } catch {}
    const c = document.createElement("canvas");
    c.width = 700; c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = INK;
    ctx.font = `72px ${fam}`;
    ctx.textBaseline = "middle";
    ctx.fillText(typed || name, 20, 110);
    return c.toDataURL("image/png");
  }

  async function adopt() {
    if (tab === "draw") {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) { toast.error("Draw your signature first."); return; }
      onAdopt(pad.toDataURL("image/png"));
    } else if (tab === "upload") {
      if (!uploaded) { toast.error("Upload an image of your signature first."); return; }
      onAdopt(uploaded);
    } else {
      if (!typed.trim()) { toast.error("Type your name first."); return; }
      onAdopt(await typedToDataUrl());
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isInitials ? "Add your initials" : "Adopt your signature"}</DialogTitle>
        </DialogHeader>
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v)} className="w-full" aria-label="Signature method">
          <ToggleGroupItem value="draw">Draw</ToggleGroupItem>
          <ToggleGroupItem value="type">Type</ToggleGroupItem>
          <ToggleGroupItem value="upload">Upload</ToggleGroupItem>
        </ToggleGroup>

        {tab === "draw" && (
          <div className="light relative h-44 overflow-hidden rounded-lg border bg-background">
            <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" aria-label="Signature pad" />
            <div className="pointer-events-none absolute right-6 bottom-8 left-6 border-b border-dashed border-input" />
            <Button variant="ghost" size="xs" className="absolute top-2 right-2" onClick={() => padRef.current?.clear()}>
              Clear
            </Button>
          </div>
        )}

        {tab === "type" && (
          <div className="grid gap-3">
            <Input aria-label="Your name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" />
            <div className="light flex h-28 items-center justify-center overflow-hidden rounded-lg border bg-background px-4">
              <span ref={previewRef} className="truncate text-4xl leading-normal text-foreground" style={{ fontFamily: FONT }}>
                {typed || name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Signature style">
              {SIGNATURE_FONTS.map((f, i) => (
                <button
                  key={f.name}
                  type="button"
                  role="radio"
                  aria-checked={fontIdx === i}
                  aria-label={f.name}
                  onClick={() => setFontIdx(i)}
                  className={cn(
                    "flex h-11 items-center justify-center overflow-hidden rounded-md border px-2 transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60",
                    fontIdx === i && "border-foreground ring-1 ring-foreground",
                  )}
                >
                  <span className="truncate text-xl" style={{ fontFamily: f.css }}>{typed || name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "upload" && (
          uploaded ? (
            <div className="light relative flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-background p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploaded} alt="Your signature" className="max-h-full max-w-full object-contain" />
              <Button variant="ghost" size="xs" className="absolute top-2 right-2" onClick={() => setUploaded(null)}>
                Replace
              </Button>
            </div>
          ) : (
            <Dropzone
              accept="image/png,image/jpeg"
              onFiles={(files) => files[0] && ingestImage(files[0])}
              title="Upload an image of your signature"
              hint="PNG or JPG. A transparent PNG works best."
              className="h-44"
            />
          )
        )}

        <p className="text-xs text-muted-foreground">By adopting, you agree this is your legal signature for this document.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={adopt}><PenLine /> Adopt and sign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DoneView({ done, envelopeId, token }: { done: { completed: boolean; sha256?: string; certCN?: string; anchorState?: string }; envelopeId: string; token: string }) {
  const meta = done.completed
    ? [
        done.certCN && `Sealed by ${done.certCN}`,
        done.anchorState && done.anchorState !== "none" && (done.anchorState === "confirmed" ? "Timestamp recorded" : "Confirming timestamp"),
      ].filter(Boolean).join(" · ")
    : "";
  return (
    <StateScreen
      icon={Check}
      tone="success"
      title="You've signed"
      description={done.completed
        ? "Everyone has signed and the document is sealed."
        : "Your signature is recorded. Everyone gets the sealed copy once the other signers finish."}
    >
      {done.completed && (
        <div className="mt-6 grid justify-items-center gap-3">
          <Button asChild>
            <a href={`/api/file/${envelopeId}?variant=sealed&token=${token}`} target="_blank"><Download /> Download sealed PDF</a>
          </Button>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </div>
      )}

      <div className="mt-10 rounded-lg border bg-background p-4 text-left">
        <p className="text-sm font-medium">Seal your own documents</p>
        <p className="mt-1 text-sm text-muted-foreground">Send documents for signing and let anyone verify they're genuine.</p>
        <div className="mt-3 flex items-center gap-2">
          <Button asChild size="sm" variant="outline"><a href="/signup">Create a free account</a></Button>
          <Button asChild size="sm" variant="ghost"><a href="/verify">Verify a document</a></Button>
        </div>
      </div>
    </StateScreen>
  );
}

function StateScreen({
  icon: Icon, tone, title, description, children,
}: { icon: React.ElementType; tone?: "success"; title: string; description: string; children?: React.ReactNode }) {
  return (
    <Centered>
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-md border bg-background shadow-xs">
          <Icon className={cn("size-5", tone === "success" ? "text-success" : "text-muted-foreground")} />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">{children}</div>;
}
