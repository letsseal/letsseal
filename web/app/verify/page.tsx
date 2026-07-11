"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Link as LinkIcon, ShieldCheck, Anchor, Globe, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SealMark } from "@/components/brand/SealMark";
import { Wordmark } from "@/components/brand/Wordmark";
import { ProofCertificate } from "@/components/ProofCertificate";


type Result = {
  sealed: boolean; sha256: string; intact?: boolean; valid?: boolean; trusted?: boolean; authentic?: boolean;
  signer?: string; signed_at?: string; reason?: string; onRecord?: boolean;
  registry?: { org: string; title: string; completedAt: string | null; auditEvents: number } | null;
  anchor?: { state: string; btcBlock: number | null } | null;
  otsUrl?: string | null;
};

function proofId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const fromUrl = s.match(/\/d\/([A-Za-z0-9_]+)/);
  const id = fromUrl ? fromUrl[1] : s;
  if (/^[0-9a-fA-F]{64}$/.test(id)) return id.toLowerCase(); 
  if (/^(sd_|cred_|c)[A-Za-z0-9_]{6,}$/.test(id)) return id;  
  return null;
}

export default function Verify() {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupErr, setLookupErr] = useState(false);

  async function verify(file: File) {
    setLoading(true); setResult(null);
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/api/verify", { method: "POST", body: form });
    setResult(await res.json()); setLoading(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToProof() {
    const id = proofId(lookup);
    if (!id) { setLookupErr(true); return; }
    router.push(`/d/${id}`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-ink">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Wordmark href="https://letsseal.org" size="md" />
          <nav className="flex items-center gap-1 text-sm">
            <a href="https://letsseal.org/how-it-works" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-ink">How it works</a>
            <a href="https://app.letsseal.org" className="rounded-md px-3 py-1.5 font-medium text-brand hover:underline">Seal a document</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14 sm:py-20">
        <div className="text-center">
          <SealMark className="mx-auto h-12 w-12" color="var(--brand)" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Verify a document</h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            The independent portal for checking a Let&apos;s Seal document is authentic and unaltered.
            No account. Free. You can even confirm it offline — without us.
          </p>
        </div>

        {result ? (
          <div className="mt-10">
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
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {result.onRecord && (
                <Button asChild variant="outline" className="gap-2">
                  <a href={`/d/${result.sha256}`}><LinkIcon className="h-4 w-4" /> Open shareable proof page</a>
                </Button>
              )}
              <Button variant="ghost" onClick={() => setResult(null)}>Verify another</Button>
            </div>
          </div>
        ) : (
          <div className="mt-10 space-y-4">
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files?.[0] && verify(e.dataTransfer.files[0]); }}
              className={`block cursor-pointer rounded-2xl border-2 border-dashed bg-card p-12 text-center transition ${drag ? "border-brand bg-brand/5" : "hover:border-input"}`}>
              <input type="file" accept="application/pdf" className="hidden"
                     onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
              {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="mx-auto h-8 w-8 text-muted-foreground" />}
              <div className="mt-3 font-medium">{loading ? "Verifying…" : "Drop a PDF here, or click to upload"}</div>
              <div className="mt-1 text-sm text-muted-foreground">The file is hashed and checked — it never leaves your control beyond the check.</div>
            </label>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); goToProof(); }}
                  className="rounded-2xl border bg-card p-4">
              <label className="text-sm font-medium">Have a fingerprint or a proof link?</label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={lookup}
                  onChange={(e) => { setLookup(e.target.value); setLookupErr(false); }}
                  placeholder="Paste a SHA-256 or a letsseal.org/d/… link"
                  className="font-mono text-sm" />
                <Button type="submit" className="shrink-0 gap-1.5"><Search className="h-4 w-4" /> Check</Button>
              </div>
              {lookupErr && <p className="mt-2 text-sm text-red-600">That doesn&apos;t look like a SHA-256 fingerprint or a proof link.</p>}
            </form>
          </div>
        )}

        <section className="mt-16 border-t pt-10">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">How verification works</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <Pillar icon={ShieldCheck} title="Cryptographic seal">
              A PAdES signature that chains to the Let&apos;s Seal certificate authority — proving the
              document is byte-for-byte what was sealed, and who sealed it.
            </Pillar>
            <Pillar icon={Anchor} title="Independent timestamp">
              A decentralised OpenTimestamps anchor on the Bitcoin ledger — free, permanent proof of
              when it existed, with no authority to trust.
            </Pillar>
            <Pillar icon={Globe} title="Check it without us">
              Download the <code className="rounded bg-muted px-1 py-0.5 text-xs">.ots</code> proof and run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">ots verify</code> yourself. Verification
              needs nothing of ours — the portal is a convenience, not the source of truth.
            </Pillar>
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t just trust the badge — verify the file. A copied seal on a fake document has no valid signature and fails here.{" "}
            <a href="https://letsseal.org/how-it-works" className="text-brand hover:underline">Learn more <ArrowRight className="inline h-3 w-3" /></a>
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground">
          <span>Let&apos;s Seal — free, open document authenticity. Secured by nobody, verifiable by anyone.</span>
          <nav className="flex gap-4">
            <a href="https://letsseal.org" className="hover:text-ink">About</a>
            <a href="https://letsseal.org/trust" className="hover:text-ink">Root of trust</a>
            <a href="https://app.letsseal.org" className="hover:text-ink">Seal a document</a>
            <a href="https://github.com/letsseal" className="hover:text-ink">Open source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Pillar({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-brand" /> {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
