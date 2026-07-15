import Link from "next/link";
import { Check, X, ShieldCheck, Stamp, ScanLine, Anchor, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { Wordmark } from "@/components/brand/Wordmark";
import { SealMark } from "@/components/brand/SealMark";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const LIVE_PROOF = "/d/347a86171f0faf66a2b46375d73fc5dd430178dd2a31eef340d5805490e128ce";

const STANDARDS = ["PAdES signatures", "X.509 certificates", "RFC 3161 timestamps", "OpenTimestamps", "SHA-256"];

const FEATURES = [
  { title: "Free, forever", body: "No per-seal or per-envelope fees. The cryptography behind a document seal is free and standard — there's no reason to rent it." },
  { title: "Your own authority", body: "Seal documents with your own certificate authority. Tamper-evident PAdES signatures, entirely under your control — trust flows from your own published root." },
  { title: "Anchored to a public ledger", body: "Every seal gets an independent, decentralised timestamp via OpenTimestamps — free, permanent proof of when a document existed, recorded on a public ledger no one controls." },
  { title: "Publicly verifiable", body: "Anyone can confirm a document on the public portal, or offline with stock tools — the proof carries everything a verifier needs. Independently checkable, anywhere." },
];

const COMPARISON: { label: string; ours: string; theirs: string; oursWin: boolean }[] = [
  { label: "Cost", ours: "Free", theirs: "Per-seal / per-envelope fees", oursWin: true },
  { label: "Proof of date", ours: "Independent public ledger (Bitcoin)", theirs: "The vendor's own timestamp", oursWin: true },
  { label: "Verify outside their app", ours: "Public page + .ots file, offline", theirs: "Trust indicator inside Adobe Reader", oursWin: true },
  { label: "A printed copy stays verifiable", ours: "Yes — QR on every page", theirs: "No", oursWin: true },
  { label: "Self-host", ours: "Yes", theirs: "No", oursWin: true },
  { label: "Open source", ours: "Yes (Apache-2.0)", theirs: "No", oursWin: true },
  { label: "Automatic trust indicator in Adobe Reader", ours: "No — verify via the portal", theirs: "Yes", oursWin: false },
];

export default async function Landing() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-background text-ink">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Wordmark href="/" size="md" />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/verify">Verify a document</Link></Button>
            {signedIn ? (
              <Button asChild size="sm"><Link href="/app">Dashboard</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link href="/signin">Sign in</Link></Button>
                <Button asChild size="sm"><Link href="/signup">Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-24 pb-14 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Open source · Self-hosted · Free
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Document sealing for everyone
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          An open, self-hosted alternative to paid AATL certificate seals. Prove a document is authentic
          and unaltered with your own certificate authority, and anchor the proof to a decentralised public
          ledger so anyone can verify it — independently, and for free.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg"><Link href={signedIn ? "/app" : "/signup"}>Get started</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/verify">Verify a document</Link></Button>
        </div>
        <p className="mt-4 text-sm">
          <Link href={LIVE_PROOF} target="_blank" className="text-brand hover:underline">
            See a real proof, anchored on a public ledger →
          </Link>
        </p>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Built on open standards</span>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {STANDARDS.map((s) => <span key={s} className="font-medium">{s}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <SealMark className="mx-auto h-9 w-9" color="var(--brand)" />
          <p className="mt-6 text-xl font-medium leading-relaxed text-ink">
            We believe proof of authenticity should be public infrastructure — not a subscription.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Proving a document is real shouldn&apos;t mean paying to join a private trust list. The tools to prove a
            document is genuine should belong to everyone — not sit behind a certificate vendor&apos;s paywall.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-ink">Two independent layers of proof</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
          A cryptographic seal proves who and what. An independent timestamp proves when. Together, anyone can verify both.
          Let&apos;s Seal holds no cryptocurrency and you never touch a coin or a wallet — we use the public ledger the way a
          notary uses a public register: to stamp a record no one can alter.
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {[
            { icon: Stamp, title: "Seal", body: "Your own certificate authority signs the finished PDF (PAdES). Tamper-evident, standards-based, and entirely yours." },
            { icon: Anchor, title: "Anchor", body: "The document's SHA-256 gets an independent, decentralised timestamp via OpenTimestamps — free, permanent proof of existence and date, on a public ledger no one controls." },
            { icon: ScanLine, title: "Verify", body: "A public proof page — plus a QR on every sealed page — lets anyone confirm authenticity, independently and offline." },
          ].map((s, i) => (
            <div key={s.title}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border text-ink"><s.icon className="h-5 w-5" /></span>
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-ink">How it compares</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
            Paid AATL seals add one thing the free, standard cryptography doesn&apos;t: an automatic trust
            indicator inside Adobe Reader. Here is the full picture.
          </p>
          <div className="mt-10 overflow-hidden rounded-xl border bg-background">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b bg-muted/50 text-sm font-medium">
              <div className="p-4"></div>
              <div className="p-4 text-ink">Let&apos;s Seal</div>
              <div className="p-4 text-muted-foreground">Paid AATL</div>
            </div>
            {COMPARISON.map((r) => (
              <div key={r.label} className="grid grid-cols-[1.5fr_1fr_1fr] border-b text-sm last:border-b-0">
                <div className="p-4 font-medium text-ink">{r.label}</div>
                <div className="flex items-start gap-2 p-4">
                  {r.oursWin ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span>{r.ours}</span>
                </div>
                <div className="flex items-start gap-2 p-4 text-muted-foreground">
                  {r.oursWin ? <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600/70" />}
                  <span>{r.theirs}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-ink" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink">You never have to take our word for it</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Every sealed document has a public proof page and a downloadable OpenTimestamps proof you can check
          against Bitcoin yourself — the proof stands on its own, forever.
        </p>
        <div className="mt-6">
          <Button asChild variant="outline"><Link href={LIVE_PROOF} target="_blank">Open a live proof →</Link></Button>
        </div>
      </section>

      <section className="border-t bg-ink text-background">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Seal your first document in minutes</h2>
          <p className="mx-auto mt-3 max-w-md text-background/70">Free, open source, and self-hostable. No account needed to verify.</p>
          <div className="mt-8">
            <Button asChild size="lg" variant="secondary" className="gap-2">
              <Link href={signedIn ? "/app" : "/signup"}>Get started <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Wordmark href="/" size="sm" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Free, open-source document sealing. Cryptographic authenticity, anchored to a public ledger.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Product</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/signup" className="text-ink hover:text-brand">Get started</Link></li>
              <li><Link href="/verify" className="text-ink hover:text-brand">Verify a document</Link></li>
              <li><Link href="/signin" className="text-ink hover:text-brand">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Project</h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><span className="text-muted-foreground">Open source (Apache-2.0)</span></li>
              <li><span className="text-muted-foreground">Self-hostable</span></li>
              <li><Link href={LIVE_PROOF} target="_blank" className="text-ink hover:text-brand">Live proof</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
