"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import {
  Check, ChevronRight, Loader2, ShieldCheck, Download, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import PdfCanvas, { FieldBox } from "./PdfCanvas";
import { recipientColor } from "@/lib/signers";

const SIGNATURE_FONTS = [
  { name: "Dancing Script", css: "var(--font-sig-1), cursive" },
  { name: "Great Vibes", css: "var(--font-sig-2), cursive" },
  { name: "Caveat", css: "var(--font-sig-3), cursive" },
  { name: "Sacramento", css: "var(--font-sig-4), cursive" },
];

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
  const [done, setDone] = useState<null | { completed: boolean; sha256?: string; certCN?: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adopted, setAdopted] = useState<string | null>(null); 

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/sign/${token}`);
      if (!res.ok) { setError("This signing link is invalid or has expired."); return; }
      setData(await res.json());
    })();
  }, [token]);

  // Map each recipient to a stable color index (same scheme as the builder).
  const signerIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (data) for (const f of data.envelope.fields) {
      if (f.signerId && !map.has(f.signerId)) map.set(f.signerId, map.size);
    }
    return map;
  }, [data]);

  if (error) return <Centered><p className="text-neutral-600">{error}</p></Centered>;
  if (!data) return <Centered><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></Centered>;
  if (data.signer.status === "signed" && !done)
    return <Centered><p className="text-neutral-600">You have already signed this document. Thank you.</p></Centered>;

  const myIdx = signerIndex.get(data.signer.id) ?? 0;
  const myColor = recipientColor(myIdx);
  const myFields = data.envelope.fields
    .filter((f) => f.mine)
    .sort((a, b) => a.page - b.page || a.y - b.y);
  const filledCount = myFields.filter((f) => values[f.id!] !== undefined && values[f.id!] !== "").length;
  const nextField = myFields.find((f) => values[f.id!] === undefined || values[f.id!] === "");
  const allDone = filledCount === myFields.length;

  const previewFields: FieldBox[] = data.envelope.fields.map((f) => ({
    ...f, value: f.mine ? values[f.id!] ?? null : f.value ?? null,
    signerIndex: f.signerId ? signerIndex.get(f.signerId) ?? 0 : 0,
  }));

  function fill(f: FieldBox, v: string) { setValues((p) => ({ ...p, [f.id!]: v })); }

  function activate(f: FieldBox) {
    if (f.type === "checkbox") return fill(f, values[f.id!] ? "" : "X");
    if (f.type === "date") return fill(f, new Date().toISOString().slice(0, 10));
    if (f.type === "text" || f.type === "initials") {
      if (f.type === "signature" || f.type === "initials") { /* handled below */ }
      if (f.type === "text") {
        const v = window.prompt("Enter text:", values[f.id!] ?? "");
        if (v !== null) fill(f, v);
        return;
      }
    }
    if (f.type === "signature" || f.type === "initials") {
      if (adopted) return fill(f, adopted); // reuse adopted signature
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
    if (!allDone) { toast.error("Please complete all your fields first."); return; }
    if (data!.signer.hasAccessCode && !accessCode) { toast.error("Enter your access code to finish."); return; }
    setSubmitting(true);
    const res = await fetch(`/api/sign/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, accessCode }),
    });
    setSubmitting(false);
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Submission failed"); return; }
    setDone(body);
  }

  if (done) return <DoneView done={done} envelopeId={data.envelope.id} />;

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-semibold shrink-0"
                style={{ background: data.envelope.org.brandColor }}>
            {data.envelope.org.name[0]}
          </span>
          <div className="min-w-0">
            <div className="font-medium truncate">{data.envelope.title}</div>
            <div className="text-xs text-neutral-500 truncate">{data.envelope.org.name} · signing as {data.signer.name}</div>
          </div>
          <div className="flex-1" />
          <Badge variant="secondary" className="font-normal hidden sm:flex">{filledCount} / {myFields.length} done</Badge>
          {data.signer.hasAccessCode && (
            <Input placeholder="Access code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
                   className="h-9 w-32 hidden sm:block" />
          )}
          <Button onClick={submit} disabled={submitting || !allDone}
                  className="gap-2 text-white" style={{ background: allDone ? data.envelope.org.brandColor : undefined }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {submitting ? "Sealing…" : "Finish & sign"}
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-8">
        <PdfCanvas fileUrl={`/api/file/${data.envelope.id}`} fields={previewFields}
                   mode="sign" activeSignerIndex={myIdx} pointerFieldId={nextField?.id ?? undefined}
                   onFieldClick={activate} />
      </main>

      {!allDone && (
        <button onClick={goToNext}
                className="fixed left-1/2 -translate-x-1/2 bottom-6 z-30 flex items-center gap-2 rounded-full px-5 py-3 text-white font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2"
                style={{ background: myColor.solid }}>
          {filledCount === 0 ? "Start signing" : "Next field"}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {allDone && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-30 flex items-center gap-2 rounded-full bg-green-600 px-5 py-3 text-white font-medium shadow-lg">
          <Check className="h-4 w-4" /> All fields complete — press Finish
        </div>
      )}

      {editing && (
        <SignatureDialog
          name={data.signer.name}
          color={myColor.solid}
          isInitials={editing.type === "initials"}
          onClose={() => setEditing(null)}
          onAdopt={(dataUrl) => { setAdopted(dataUrl); fill(editing, dataUrl); setEditing(null); }}
        />
      )}
    </div>
  );
}

function SignatureDialog({
  name, color, isInitials, onAdopt, onClose,
}: { name: string; color: string; isInitials: boolean; onAdopt: (d: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  const [tab, setTab] = useState("draw");
  const [typed, setTyped] = useState(name);
  const [fontIdx, setFontIdx] = useState(0);
  const FONT = SIGNATURE_FONTS[fontIdx].css;

  useEffect(() => {
    if (tab !== "draw" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Fixed buffer matching the CSS size — avoids the grid/auto-size collapse
    // that leaves the canvas ~0px wide inside the dialog.
    canvas.width = 448;
    canvas.height = 170;
    padRef.current = new SignaturePad(canvas, { penColor: "#1f2937", minWidth: 1, maxWidth: 2.5 });
    return () => padRef.current?.off();
  }, [tab]);

  async function typedToDataUrl(): Promise<string> {
    // Read the real resolved font family from the live preview element, so the
    // canvas render matches exactly what the signer picked.
    const fam = previewRef.current
      ? getComputedStyle(previewRef.current).fontFamily
      : FONT;
    try { await (document as any).fonts?.load?.(`72px ${fam}`); } catch {}
    const c = document.createElement("canvas");
    c.width = 700; c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1f2937";
    ctx.font = `72px ${fam}`;
    ctx.textBaseline = "middle";
    ctx.fillText(typed || name, 20, 110);
    return c.toDataURL("image/png");
  }

  async function adopt() {
    if (tab === "draw") {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) { toast.error("Please draw your signature first."); return; }
      onAdopt(pad.toDataURL("image/png"));
    } else {
      if (!typed.trim()) { toast.error("Type your name first."); return; }
      onAdopt(await typedToDataUrl());
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white" style={{ background: "#fff" }}>
        <DialogHeader>
          <DialogTitle>{isInitials ? "Add your initials" : "Adopt your signature"}</DialogTitle>
        </DialogHeader>
        <div className="mx-auto w-full" style={{ maxWidth: 448 }}>
          <div className="flex rounded-lg border bg-neutral-100 p-0.5 mb-3">
            {(["draw", "type"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-1.5 text-sm rounded-md capitalize transition ${tab === t ? "bg-white shadow-sm font-medium" : "text-neutral-500"}`}>
                {t}
              </button>
            ))}
          </div>
          {tab === "draw" ? (
            <div className="relative">
              <canvas ref={canvasRef} style={{ width: "100%", height: 170 }}
                      className="border rounded-lg touch-none bg-white" />
              <button onClick={() => padRef.current?.clear()}
                      className="absolute top-2 right-3 text-xs text-neutral-400 hover:text-neutral-600">Clear</button>
              <div className="absolute bottom-6 left-6 right-6 border-b border-dashed border-neutral-300 pointer-events-none" />
            </div>
          ) : (
            <div>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" className="mb-3" />
              <div className="h-[110px] border rounded-lg flex items-center justify-center bg-white overflow-hidden px-4 mb-3">
                <span ref={previewRef} style={{ fontFamily: FONT, fontSize: 46, color: "#1f2937", lineHeight: 1 }}>
                  {typed || name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SIGNATURE_FONTS.map((f, i) => (
                  <button key={f.name} onClick={() => setFontIdx(i)}
                          className={`h-11 rounded-md border flex items-center justify-center overflow-hidden px-2 transition ${fontIdx === i ? "ring-2 border-transparent" : "hover:bg-neutral-50"}`}
                          style={fontIdx === i ? { ["--tw-ring-color" as any]: color } : {}}>
                    <span style={{ fontFamily: f.css, fontSize: 22, color: "#1f2937" }} className="truncate">
                      {typed || name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-neutral-500">By adopting, you agree this is your legal signature for this document.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={adopt} className="gap-2 text-white" style={{ background: color }}>
            <PenLine className="h-4 w-4" /> Adopt & sign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DoneView({ done, envelopeId }: { done: { completed: boolean; sha256?: string; certCN?: string }; envelopeId: string }) {
  return (
    <Centered>
      <div className="text-center max-w-md">
        <span className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check className="h-8 w-8 text-green-600" />
        </span>
        <h1 className="text-2xl font-semibold mt-5">You've signed</h1>
        {done.completed ? (
          <>
            <p className="text-neutral-600 mt-2">All parties have signed. The document has been cryptographically sealed.</p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-neutral-500 bg-neutral-100 rounded-full px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              Sealed by {done.certCN} · {done.sha256?.slice(0, 20)}…
            </div>
            <div className="mt-6">
              <Button asChild className="gap-2">
                <a href={`/api/file/${envelopeId}?variant=sealed`} target="_blank"><Download className="h-4 w-4" /> Download sealed PDF</a>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-neutral-600 mt-2">Your signature is recorded. We're waiting on the other signers, then everyone gets the sealed copy.</p>
        )}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center px-6 bg-neutral-100">{children}</div>;
}
