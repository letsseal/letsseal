import { PageHead, Container, H2, Card, CodeBlock, LinkArrow, Eyebrow } from "../_components/ui";
import { ShieldCheck, Download, Anchor } from "lucide-react";
import {
  ROOT_CA_PEM, ROOT_CA_FINGERPRINT_SHA256, INTERMEDIATE_CA_FINGERPRINT_SHA256,
  ROOT_CA_SUBJECT, ROOT_CA_VALIDITY,
} from "@/lib/trust";
import { getNetworkStats } from "@/lib/stats";

export const metadata = {
  title: "Root of trust — Let's Seal",
  description:
    "The published Let's Seal root certificate. Every seal chains to it; verification pins it. Download the cert, check the fingerprint, and verify any document independently — without us.",
};

export const revalidate = 300;

export default async function TrustPage() {
  const stats = await getNetworkStats();

  return (
    <>
      <PageHead
        eyebrow="Root of trust"
        title="One published root. Every seal chains to it."
        lede="A Let's Seal document is authentic because its seal chains to this one root certificate, and its date is anchored to a public ledger. Both are published and fixed — so anyone can verify a document against a known anchor, independently, with nothing of ours running."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <Eyebrow>The certificate</Eyebrow>
          <H2 className="mt-3.5">Let&rsquo;s Seal Root CA</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            This is the public root certificate — the cert, never the private key. It is deliberately{" "}
            <em>not</em> in any operating-system or Adobe trust store (that&rsquo;s the point: no pay-to-play trust
            list). Instead you pin it here and verify against it directly.
          </p>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card>
              <dl className="space-y-3 text-[14px]">
                <Field label="Subject">{ROOT_CA_SUBJECT}</Field>
                <Field label="Valid">{ROOT_CA_VALIDITY}</Field>
                <Field label="Root SHA-256"><code className="break-all font-mono text-[12px] text-stone-700">{ROOT_CA_FINGERPRINT_SHA256}</code></Field>
                <Field label="Intermediate SHA-256"><code className="break-all font-mono text-[12px] text-stone-700">{INTERMEDIATE_CA_FINGERPRINT_SHA256}</code></Field>
              </dl>
              <a href="/api/root-ca"
                 className="mt-5 inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3.5 py-2 text-[14px] font-medium text-stone-800 hover:bg-stone-50">
                <Download className="h-4 w-4" /> Download root certificate
              </a>
            </Card>
            <Card className="bg-stone-50">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-blue-700">
                <ShieldCheck className="h-4 w-4" /> How the chain works
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-stone-600">
                The root signs one <strong>intermediate</strong>, which signs each business&rsquo;s{" "}
                <strong>signing certificate</strong>. When you verify a document, its PAdES signature is checked up
                that chain to this root. A valid chain means the seal was issued through Let&rsquo;s Seal and the file
                is byte-for-byte intact — it does <em>not</em> assert the issuer&rsquo;s real-world identity.
              </p>
            </Card>
          </div>

          <details className="mt-6 rounded-2xl border border-stone-200 bg-white">
            <summary className="cursor-pointer px-6 py-4 text-[14px] font-medium text-stone-700">Show the PEM</summary>
            <div className="px-6 pb-6"><CodeBlock>{ROOT_CA_PEM.trim()}</CodeBlock></div>
          </details>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <Eyebrow>Verify independently</Eyebrow>
          <H2 className="mt-3.5">Check a document without relying on us</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            The portal is a convenience, not the source of truth. With the file, its{" "}
            <code className="rounded bg-white px-1 py-0.5 text-[13px]">.ots</code> proof, and this root cert, you can
            confirm both claims offline:
          </p>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div>
              <div className="text-[13px] font-semibold text-stone-500">1 · The seal (integrity + issuer chain)</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
                Validate the PDF&rsquo;s PAdES signature against the downloaded root with any standard X.509/PAdES
                validator. A valid chain + full-file coverage = byte-for-byte the document that was sealed.
              </p>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-stone-500">2 · The date (independent timestamp)</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">Run the stock OpenTimestamps client against the public Bitcoin ledger — no Let&rsquo;s Seal server involved:</p>
              <div className="mt-3"><CodeBlock>ots verify your-file.pdf.ots</CodeBlock></div>
            </div>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14 sm:py-18">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Anchor className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-[15px] font-semibold text-stone-900">Anchored to a public ledger, live</div>
                <p className="mt-1 text-[14px] text-stone-600">
                  {stats.latestBlock
                    ? <>Most recent proof anchored in <strong>Bitcoin block #{stats.latestBlock.toLocaleString()}</strong>.</>
                    : <>Proofs are anchored to Bitcoin via OpenTimestamps as they confirm.</>}
                </p>
              </div>
            </div>
            <LinkArrow href="https://verify.letsseal.org">Verify a document</LinkArrow>
          </div>
        </Container>
      </section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wider text-stone-400">{label}</dt>
      <dd className="text-stone-800">{children}</dd>
    </div>
  );
}
