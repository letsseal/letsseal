"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldX, Upload, Loader2, ArrowLeft, Check, X, Bitcoin, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result = {
  sealed: boolean; sha256: string; intact?: boolean; valid?: boolean; trusted?: boolean;
  signer?: string; signed_at?: string; reason?: string; onRecord?: boolean;
  registry?: { org: string; title: string; completedAt: string | null; auditEvents: number } | null;
  anchor?: { state: string; btcBlock: number | null } | null;
  otsUrl?: string | null;
};

export default function Verify() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);

  async function verify(file: File) {
    setLoading(true); setResult(null);
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/verify", { method: "POST", body: form });
    setResult(await res.json()); setLoading(false);
  }

  const ok = result?.sealed && result.intact && result.valid;

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4 text-neutral-500">
        <Link href="/"><ArrowLeft className="h-4 w-4" /> docsigner</Link>
      </Button>
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-lg bg-neutral-900 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-white" /></span>
        <h1 className="text-2xl font-bold">Verify a document</h1>
      </div>
      <p className="text-neutral-500 mt-3">
        Upload a sealed PDF to confirm it is authentic and unaltered. This portal is the trust anchor —
        no Adobe account or paid certificate required.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files?.[0] && verify(e.dataTransfer.files[0]); }}
        className={`block mt-8 border-2 border-dashed rounded-2xl bg-white p-12 text-center cursor-pointer transition ${drag ? "border-neutral-500 bg-neutral-50" : "hover:border-neutral-400"}`}>
        <input type="file" accept="application/pdf" className="hidden"
               onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
        {loading ? <Loader2 className="h-8 w-8 mx-auto text-neutral-400 animate-spin" /> : <Upload className="h-8 w-8 mx-auto text-neutral-300" />}
        <div className="mt-3 font-medium">{loading ? "Verifying…" : "Drop a PDF here or click to upload"}</div>
      </label>

      {result && (
        <div className={`mt-8 rounded-2xl border p-6 ${ok ? "border-green-200 bg-green-50" : result.sealed ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"}`}>
          <div className="flex items-center gap-3">
            {ok ? <ShieldCheck className="h-8 w-8 text-green-600" />
              : result.sealed ? <ShieldX className="h-8 w-8 text-red-600" />
              : <ShieldAlert className="h-8 w-8 text-neutral-400" />}
            <div>
              <div className={`text-lg font-semibold ${ok ? "text-green-700" : result.sealed ? "text-red-700" : "text-neutral-700"}`}>
                {ok ? "Authentic & unaltered" : result.sealed ? "Tampered or untrusted" : "Not a sealed document"}
              </div>
              {result.signer && <div className="text-xs text-neutral-500 truncate max-w-md">{result.signer}</div>}
            </div>
          </div>

          {result.sealed && (
            <div className="mt-5 grid gap-2 text-sm">
              <Check2 ok={result.intact}>Document is unaltered (integrity intact)</Check2>
              <Check2 ok={result.valid}>Cryptographic signature is valid</Check2>
              <Check2 ok={result.trusted}>Certificate chains to our trusted CA</Check2>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-black/5">
            <div className="text-xs font-medium text-neutral-500 mb-1.5">Registry lookup</div>
            {result.onRecord && result.registry ? (
              <div className="text-sm">
                <Check className="h-3.5 w-3.5 text-green-600 inline mr-1" />
                Matches <b>{result.registry.title}</b> from <b>{result.registry.org}</b>
                {result.registry.completedAt && <> · completed {new Date(result.registry.completedAt).toLocaleDateString()}</>}
                <> · {result.registry.auditEvents} audit events</>
              </div>
            ) : (
              <div className="text-sm text-neutral-500">No matching record on this platform.</div>
            )}
          </div>

          {result.anchor && result.anchor.state !== "none" && (
            <div className="mt-4 pt-4 border-t border-black/5">
              <div className="text-xs font-medium text-neutral-500 mb-1.5 flex items-center gap-1.5">
                <Bitcoin className="h-3.5 w-3.5 text-orange-500" /> Bitcoin timestamp (OpenTimestamps)
              </div>
              {result.anchor.state === "confirmed" ? (
                <div className="text-sm">
                  <Check className="h-3.5 w-3.5 text-green-600 inline mr-1" />
                  Anchored in Bitcoin block <b>{result.anchor.btcBlock}</b>
                  {result.anchor.btcBlock && (
                    <a href={`https://mempool.space/block/${result.anchor.btcBlock}`} target="_blank"
                       className="text-blue-600 hover:underline ml-2">view on explorer →</a>
                  )}
                </div>
              ) : (
                <div className="text-sm text-neutral-600 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Submitted to the Bitcoin calendars — confirming (~a few hours).
                </div>
              )}
              {result.otsUrl && (
                <a href={result.otsUrl} className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Download className="h-3 w-3" /> Download .ots proof (verify independently with <code className="font-mono">ots verify</code>)
                </a>
              )}
            </div>
          )}

          <div className="mt-4 text-[11px] font-mono text-neutral-400 break-all">SHA-256 {result.sha256}</div>
        </div>
      )}
    </main>
  );
}

function Check2({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <Check className="h-4 w-4 text-green-600 shrink-0" /> : <X className="h-4 w-4 text-red-600 shrink-0" />}
      <span className={ok ? "text-neutral-700" : "text-red-700"}>{children}</span>
    </div>
  );
}
