import { PageHead, Container, H2, Card, CodeBlock, Eyebrow, LinkArrow, serif } from "../_components/ui";
import { ROOT_CA_FINGERPRINT_SHA256 } from "@/lib/trust";

export const metadata = {
  title: "SEAL, the open standard for document proof · Let's Seal",
  description:
    "SEAL, Sealed Evidence, Anchored to a Ledger. The open standard for proving any file is real: unaltered, sealed by a known certificate, and in existence by a certain date. One standard for every kind of file, verifiable by anyone, forever.",
};

const LETTERS = [
  { k: "S", w: "Sealed", d: "A PAdES signature over every byte, chaining to a published root.", s: "PAdES · X.509" },
  { k: "E", w: "Evidence", d: "The proof travels inside the file. Everything needed to verify is right there.", s: "SHA-256" },
  { k: "A", w: "Anchored", d: "The file's fingerprint, timestamped the moment it existed.", s: "OpenTimestamps" },
  { k: "L", w: "Ledger", d: "Written to the blockchain, a public clock no one owns.", s: "Public ledger" },
];

const STANDARD_LD = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "SEAL, the open standard for sealing anything",
  name: "SEAL (Sealed Evidence, Anchored to a Ledger)",
  description:
    "The open standard for proving any file is authentic: unaltered, sealed by a known certificate, and in existence by a certain date. One standard for every kind of file, verifiable by anyone, forever.",
  url: "https://letsseal.org/site/standard",
  isPartOf: { "@id": "https://letsseal.org/#website" },
  publisher: { "@id": "https://letsseal.org/#org" },
};

export default function StandardPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STANDARD_LD) }} />
      <PageHead
        eyebrow="The open standard · Version 1"
        title={<>SEAL, <span className="text-blue-600">S</span>ealed <span className="text-blue-600">E</span>vidence, <span className="text-blue-600">A</span>nchored to a <span className="text-blue-600">L</span>edger.</>}
        lede="The open standard for proving any file is real. One sealed artifact, one way to check it, verifiable by anyone, forever. Seal with any conforming tool; anyone can verify it with any other."
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
            Two independent parts, a <strong>seal</strong> (integrity + which certificate issued it) and an{" "}
            <strong>anchor</strong> (when it existed), plus one <strong>convention</strong> for referencing a proof
            (<code className="rounded bg-stone-100 px-1 py-0.5 text-[13px]">/d/&lt;sha256&gt;</code>). Everything needed
            to verify travels with the proof itself.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <Eyebrow>The guarantee</Eyebrow>
          <H2 className="mt-3.5">Open to verify. Open to implement. Impossible to lock up.</H2>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Verify independently</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                Verification stands on the published root, public standards, a public transparency log, and a public
                ledger. Everything a verifier needs travels with the proof.
              </p>
            </Card>
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Implement freely</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                Any tool may seal or verify to the standard, free and open to everyone. A standard PAdES/X.509
                validator plus the stock OpenTimestamps client is enough.
              </p>
            </Card>
            <Card>
              <div className="text-[15px] font-semibold text-stone-900">Integrity and time</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-600">
                SEAL proves a document is unaltered and existed by a date. That&rsquo;s the guarantee, complete, and
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
            <Step n="1" title="The seal, integrity + issuer">
              Validate the signature in the artifact&rsquo;s format-native form, PAdES in a PDF, C2PA in an image,
              XML-DSig in XML, S/MIME in email, or a detached CAdES sidecar for anything else. Four facts have to
              hold: the bytes are <strong>intact</strong>, the signature is <strong>valid</strong>, the certificate
              chains to the pinned SEAL root (<strong>trusted</strong>), and the signature covers the artifact
              <strong>completely</strong> for its format. A valid signature from a certificate chaining elsewhere is a
              forgery vector, reported as unrecognised, never authentic.
              <div className="mt-3 text-[13px] text-stone-500">
                Pinned root SHA-256: <code className="break-all font-mono text-[12px] text-stone-700">{ROOT_CA_FINGERPRINT_SHA256}</code> ·{" "}
                <a className="text-blue-600 hover:underline" href="/site/trust">root of trust</a>
              </div>
            </Step>
            <Step n="2" title="The anchor, time">
              Verify the <code className="rounded bg-stone-100 px-1 py-0.5 text-[13px]">.ots</code> proof against the
              public ledger with the stock client, no Let&rsquo;s Seal server involved:
              <div className="mt-3"><CodeBlock>ots verify sealed.pdf.ots</CodeBlock></div>
            </Step>
          </div>
          <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <div className={`${serif} text-[17px] text-stone-900`}>Authentic = intact ∧ valid ∧ trusted ∧ complete.</div>
            <p className="mt-1.5 text-[14px] text-stone-600">
              All four, every time. A pass from any subset would accept a document whose bytes moved after sealing, or
              one that had content added afterwards. The anchor then adds independent proof of when it existed, and the
              revocation list is consulted where it can be reached.
            </p>
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
                to check it, the way the OpenAPI Specification or a sitemap is a standard anyone can implement without
                asking permission.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
                <strong>Let&rsquo;s Seal</strong> is the project and the free network; <strong>SEAL</strong> is the open
                standard it publishes. Seal a document through Let&rsquo;s Seal and it conforms to SEAL, and so does
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
                Reference implementation: a standalone verifier (<code>spec/verify.py</code>) and the Apache-2.0 signing
                service. Verifying a SEAL proof needs a standard PAdES validator plus <code>ots verify</code>. That
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
