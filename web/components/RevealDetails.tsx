"use client";

import { useRef, useState } from "react";
import { Lock, Upload, Loader2, FileText, Users, Mail, Link2, UserCheck, AlertCircle } from "lucide-react";

type Trail = {
  signers: { name: string; channel: string; email: string | null; signedAt: string | null }[];
  entries: { action: string; actorName: string; at: string }[];
  sharedSession: boolean;
  chainIntact: boolean;
};
type Revealed = { title: string | null; trail: Trail | null };

const CHANNEL_ICON: Record<string, React.ElementType> = { email: Mail, link: Link2, in_person: UserCheck };

export function RevealDetails({ hash, hasTrail }: { hash: string; hasTrail: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [data, setData] = useState<Revealed | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  async function reveal(file: File) {
    setState("busy"); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/d/${hash}/reveal`, { method: "POST", body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't reveal details.");
      setData(j as Revealed);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reveal details.");
      setState("error");
    }
  }

  if (data) {
    return (
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCheck className="h-4 w-4 text-emerald-600" /> Details unlocked
        </div>
        {data.title && (
          <div className="mt-3 flex items-baseline justify-between gap-4 border-b py-2 text-sm">
            <span className="text-muted-foreground">Document</span>
            <span className="text-right font-medium">{data.title}</span>
          </div>
        )}
        {data.trail && data.trail.signers.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" /> Signers</div>
            <div className="mt-2 space-y-2">
              {data.trail.signers.map((s, i) => {
                const Icon = CHANNEL_ICON[s.channel] ?? Mail;
                return (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{s.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="h-3 w-3" />{s.email ? s.email : "no email on file"}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.signedAt ? new Date(s.signedAt).toLocaleString() : "not signed"}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Attribution reflects <b>control of the signing channel</b>, recorded tamper-evidently — <b>not</b> identity verification.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4 text-muted-foreground" /> {hasTrail ? "Document & signer details are private" : "Document details are private"}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The subject{hasTrail ? " and who signed" : ""}{" "}
        {hasTrail ? "aren’t" : "isn’t"} shown publicly. If you have the document, upload it to confirm it matches
        and unlock the details — it&rsquo;s hashed in your browser&rsquo;s request and never stored.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) reveal(f); }}
        disabled={state === "busy"}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-sm transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-secondary/50"
        }`}
      >
        {state === "busy"
          ? <><Loader2 className="h-5 w-5 animate-spin text-primary" /><span className="text-muted-foreground">Checking…</span></>
          : <><Upload className="h-5 w-5 text-primary" /><span className="text-muted-foreground">Upload the file to unlock</span></>}
      </button>
      {state === "error" && <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
             onChange={(e) => { const f = e.target.files?.[0]; if (f) reveal(f); e.target.value = ""; }} />
    </div>
  );
}
