"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Anchor, ArrowRight, ArrowUpRight, ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SealMark } from "@/components/brand/SealMark";
import { TopBar } from "@/components/TopBar";
import { Dropzone } from "@/components/common/dropzone";
import { Field } from "@/components/common/field";
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
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupErr, setLookupErr] = useState(false);

  async function verify(file: File) {
    setLoading(true); setResult(null); setFileName(file.name);
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
    <div className="flex min-h-screen flex-col">
      <TopBar
        href="https://letsseal.org"
        right={
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><a href="https://letsseal.org/how-it-works">How it works</a></Button>
            <Button asChild variant="outline" size="sm"><a href="https://app.letsseal.org">Seal a document</a></Button>
          </nav>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 sm:py-16">
        {result ? (
          <div className="space-y-6">
            <ProofCertificate
              headingLevel={1}
              label={fileName || "Verification result"}
              data={{
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
              }}
            />
            <div className="flex flex-wrap gap-2">
              {result.onRecord && (
                <Button asChild variant="outline">
                  <a href={`/d/${result.sha256}`}>Open proof page <ArrowUpRight /></a>
                </Button>
              )}
              <Button variant="ghost" onClick={() => setResult(null)}>Verify another</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <SealMark className="size-10" color="var(--foreground)" emboss="var(--background)" />
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">Verify a document</h1>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Check that a Let&apos;s Seal document is authentic and unaltered. Free, public, and verifiable offline with standard tools.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <Dropzone
                size="lg"
                busy={loading}
                onFiles={(f) => f[0] && verify(f[0])}
                busyTitle="Checking…"
                hint="The file is uploaded to check it and isn’t stored."
              />

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={(e) => { e.preventDefault(); goToProof(); }}>
                <Field
                  label="Have a fingerprint or proof link?"
                  htmlFor="lookup"
                  error={lookupErr ? "That doesn’t look like a SHA-256 fingerprint or a proof link." : undefined}
                >
                  <div className="flex gap-2">
                    <Input
                      id="lookup"
                      value={lookup}
                      onChange={(e) => { setLookup(e.target.value); setLookupErr(false); }}
                      placeholder="SHA-256 or letsseal.org/d/… link"
                      aria-invalid={lookupErr || undefined}
                      className="font-mono" />
                    <Button type="submit" className="shrink-0">Check</Button>
                  </div>
                </Field>
              </form>
            </div>
          </div>
        )}

        <section className="mt-16 space-y-6 border-t pt-10">
          <h2 className="text-base font-semibold tracking-tight">How verification works</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <Pillar icon={ShieldCheck} title="Cryptographic seal">
              A signature from a Let&apos;s Seal certificate proves the document is exactly what was sealed, and who sealed it.
            </Pillar>
            <Pillar icon={Anchor} title="Timestamp">
              Recorded with OpenTimestamps on Bitcoin: permanent proof of when it existed, on a public ledger no one controls.
            </Pillar>
            <Pillar icon={Terminal} title="Check it yourself">
              Download the <span className="font-mono text-xs">.ots</span> proof and run{" "}
              <span className="font-mono text-xs">ots verify</span>. The proof carries everything a verifier needs; this portal is a convenience.
            </Pillar>
          </div>
          <p className="text-sm text-muted-foreground">
            Don&apos;t just trust the badge, verify the file. A copied seal on a fake document has no valid signature and fails here.{" "}
            <a href="https://letsseal.org/how-it-works" className="inline-flex items-center gap-1 text-brand hover:underline">
              Learn more <ArrowRight className="size-3.5" />
            </a>
          </p>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span>Let&apos;s Seal: free, open document authenticity.</span>
          <nav className="flex flex-wrap gap-4">
            <a href="https://letsseal.org" className="hover:text-foreground">About</a>
            <a href="https://letsseal.org/trust" className="hover:text-foreground">Root of trust</a>
            <a href="https://app.letsseal.org" className="hover:text-foreground">Seal a document</a>
            <a href="https://github.com/letsseal" className="hover:text-foreground">Open source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Pillar({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
