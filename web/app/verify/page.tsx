"use client";

import { useState } from "react";
import { Upload, Loader2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import { SealMark } from "@/components/brand/SealMark";
import { ProofCertificate } from "@/components/ProofCertificate";

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

  return (
    <div className="min-h-screen">
      <TopBar href="/" />
      <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-3">
        <SealMark className="h-9 w-9" color="var(--brand)" />
        <h1 className="text-2xl font-bold tracking-tight">Verify a document</h1>
      </div>
      <p className="text-muted-foreground mt-3">
        Upload a sealed PDF to confirm it is authentic and unaltered. This portal is the trust anchor —
        no Adobe account or paid certificate required.
      </p>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files?.[0] && verify(e.dataTransfer.files[0]); }}
        className={`block mt-8 border-2 border-dashed rounded-2xl bg-white p-12 text-center cursor-pointer transition ${drag ? "border-primary bg-secondary" : "hover:border-input"}`}>
        <input type="file" accept="application/pdf" className="hidden"
               onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
        {loading ? <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin" /> : <Upload className="h-8 w-8 mx-auto text-muted-foreground" />}
        <div className="mt-3 font-medium">{loading ? "Verifying…" : "Drop a PDF here or click to upload"}</div>
      </label>

      {result && (
        <div className="mt-8">
          <ProofCertificate data={{
            sha256: result.sha256,
            onRecord: !!result.onRecord,
            issuer: result.registry?.org,
            title: result.registry?.title,
            completedAt: result.registry?.completedAt,
            auditEvents: result.registry?.auditEvents,
            crypto: {
              sealed: result.sealed, intact: result.intact, valid: result.valid,
              trusted: result.trusted, signer: result.signer, signed_at: result.signed_at,
            },
            anchor: result.anchor ? { state: result.anchor.state, btcBlock: result.anchor.btcBlock } : null,
            otsUrl: result.otsUrl,
          }} />
          {result.onRecord && (
            <div className="mt-4 flex justify-center">
              <Button asChild variant="outline" className="gap-2">
                <a href={`/d/${result.sha256}`}><LinkIcon className="h-4 w-4" /> Open shareable proof page</a>
              </Button>
            </div>
          )}
        </div>
      )}
      </main>
    </div>
  );
}
