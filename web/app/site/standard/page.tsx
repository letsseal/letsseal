import { PageHead, Container, H2, Card, CodeBlock, Eyebrow, LinkArrow, serif } from "../_components/ui";
import { ROOT_CA_FINGERPRINT_SHA256 } from "@/lib/trust";

export const metadata = {
  title: "SEAL — the open standard for document proof · Let's Seal",
  description:
    "SEAL — Sealed Evidence, Anchored to a Ledger. The open standard for proving a document is real: verifiable by anyone, forever, without us. Built on PAdES, X.509 and OpenTimestamps.",
};

const LETTERS = [
  { k: "S", w: "Sealed", d: "A PAdES signature over every byte, chaining to a published root.", s: "PAdES · X.509" },
  { k: "E", w: "Evidence", d: "The proof travels inside the file. No database, no lookup, no account.", s: "SHA-256" },
  { k: "A", w: "Anchored", d: "The file's fingerprint, timestamped the moment it existed.", s: "OpenTimestamps" },
  { k: "L", w: "Ledger", d: "Written to Bitcoin — a public clock no one owns.", s: "Bitcoin" },
];

export default function StandardPage() {
  return (
    <>
      <PageHead
        eyebrow="The open standard · Version 1"
        title={<>SEAL — <span className="text-blue-600">S</span>ealed <span className="text-blue-600">E</span>vidence, <span className="text-blue-600">A</span>nchored to a <span className="text-blue-600">L</span>edger.</>}
        lede="The open standard for proving any file is real. One sealed artifact, one way to check it, verifiable by anyone, forever, with us or without us. Seal with any conforming tool; anyone can verify it with any other."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LETTERS.map((l) => (
              <Card key={l.k}>
                <div className="flex items-baseline gap-2.5">
                  <span className={`${serif} text-[40px] font-semibold leading-none text-blue-600`}>{l.k}</span>
                  <span className="text-[17px] font-semibold text-stone-900">{l.w}</span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-stone-600">{l.d}</p>
                <div className="mt-3 text-[12px] font-medium uppercase tracking-wider text-stone-400">{l.s}</div>
              </Card>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Two independent parts — a <strong>seal</strong> (integrity + which certificate issued it) and an{" "}
            <strong>anchor</strong> (when it existed) — plus one <strong>convention</strong> for referencing a proof
            (<code className="rounded bg-stone-100 px-1 py-0.5 text-[13px]">/d/&lt;sha256&gt;</code>). None of it needs
            an account, a database, or Let&rsquo;s Seal being online.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <Eyebrow>The guarantee</Eyebrow>
          <H2 className="mt-3.5">Open to verify. Open to implement. Impossible to lock up.</H2>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Verify without us</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                Verification depends on the published root, public standards, and a public ledger — not on automatic
                vendor trust, and not on Let&rsquo;s Seal existing.
              </p>
            </Card>
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Implement freely</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                Any tool may seal or verify to the standard — no permission, no membership, no fee. A standard
                PAdES/X.509 validator plus the stock OpenTimestamps client is enough.
              </p>
            </Card>
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Integrity and time</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                SEAL proves a document is unaltered and existed by a date. That&rsquo;s the guarantee — complete, and
                permanent. Who sealed it is attribution by channel, and the standard is precise about the difference.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <Eyebrow>How anyone verifies a SEAL proof</Eyebrow>
          <H2 className="mt-3.5">Two checks, both independent of us</H2>
          <div className="mt-8 space-y-6">
            <Step n="1" title="The seal — integrity + issuer">
              Validate the document&rsquo;s embedded PAdES signature: it must be cryptographically valid, its
              certificate must chain to the pinned SEAL root, and it must cover the <strong>entire file</strong> (no
              content appended after signing). A valid signature from a certificate that does <em>not</em> chain to the
              root is a forgery vector — reported as unrecognised, never authentic.
              <div className="mt-3 text-[13px] text-stone-500">
                Pinned root SHA-256: <code className="break-all font-mono text-[12px] text-stone-700">{ROOT_CA_FINGERPRINT_SHA256}</code> ·{" "}
                <a className="text-blue-600 hover:underline" href="/site/trust">root of trust</a>
              </div>
            </Step>
            <Step n="2" title="The anchor — time">
              Verify the <code className="rounded bg-stone-100 px-1 py-0.5 text-[13px]">.ots</code> proof against the
              public Bitcoin ledger with the stock client — no Let&rsquo;s Seal server involved:
              <div className="mt-3"><CodeBlock>ots verify sealed.pdf.ots</CodeBlock></div>
            </Step>
          </div>
          <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className={`${serif} text-[17px] text-stone-900`}>Authentic = valid ∧ intact ∧ trusted.</div>
            <p className="mt-1.5 text-[14px] text-stone-600">Never a “pass” from a valid-but-untrusted seal. The anchor then adds independent proof of when it existed.</p>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Eyebrow>What SEAL is</Eyebrow>
              <H2 className="mt-3.5">A published standard, open to everyone</H2>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
                SEAL is a published, versioned standard for a document proof: a PAdES/X.509 signature over the whole
                file, an OpenTimestamps anchor on Bitcoin, pinned to a public root. One self-contained artifact, one way
                to check it — the way the OpenAPI Specification or a sitemap is a standard anyone can implement without
                asking permission.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
                <strong>Let&rsquo;s Seal</strong> is the project and the free network; <strong>SEAL</strong> is the open
                standard it publishes. Seal a document through Let&rsquo;s Seal and it conforms to SEAL — and so does
                anything anyone else builds to it.
              </p>
            </div>
            <Card className="bg-stone-50">
              <div className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Reference</div>
              <ul className="mt-3 space-y-3 text-[14.5px]">
                <li><LinkArrow href="/site/trust">The published root of trust</LinkArrow></li>
                <li><LinkArrow href="/site/how-it-works">How a seal is made &amp; checked</LinkArrow></li>
                <li><LinkArrow href="/site/badge">The verified badge</LinkArrow></li>
                <li><LinkArrow href="https://verify.letsseal.org">Verify a document</LinkArrow></li>
              </ul>
              <p className="mt-5 text-[13px] leading-relaxed text-stone-500">
                Reference implementation: a standalone verifier (<code>spec/verify.py</code>) and the MIT signing
                service. Verifying a SEAL proof needs a standard PAdES validator plus <code>ots verify</code> — that
                is the entire dependency list.
              </p>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[15px] font-semibold text-white">{n}</div>
      <div>
        <div className="text-[16px] font-semibold text-stone-900">{title}</div>
        <div className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-stone-600">{children}</div>
      </div>
    </div>
  );
}
