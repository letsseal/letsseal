import { PageHead, Container, H2, serif, Card, LinkArrow } from "../_components/ui";
import { FileCheck2, Fingerprint, Anchor, ShieldCheck, Check } from "lucide-react";

export const metadata = {
  title: "How it works — Let's Seal",
  description:
    "How a seal is made and how anyone can check it: a cryptographic signature over the whole file, anchored to Bitcoin, verifiable by anyone — free and instant.",
};

const STEPS = [
  {
    n: "01",
    icon: Fingerprint,
    h: "Fingerprint the whole file",
    p: "We take a SHA-256 hash of the entire document — a 64-character fingerprint that changes completely if a single byte changes. This is what gets protected.",
  },
  {
    n: "02",
    icon: FileCheck2,
    h: "Sign it (PAdES)",
    p: "The document is signed with a standard PAdES digital signature covering the whole file, using an X.509 certificate. Tamper with any covered byte afterward and the signature no longer matches.",
  },
  {
    n: "03",
    icon: Anchor,
    h: "Anchor it to Bitcoin",
    p: "The fingerprint is timestamped into the Bitcoin blockchain via OpenTimestamps. That gives independent, permanent proof the document existed — with no trust in us or any single authority.",
  },
  {
    n: "04",
    icon: ShieldCheck,
    h: "Anyone verifies — keyless",
    p: "To check a document, anyone re-hashes it and confirms the signature and the Bitcoin anchor — free and instant, open to everyone. If it matches, it's authentic and unchanged.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHead
        eyebrow="How it works"
        title="Proof, not trust."
        lede="A seal is proof carried by the file itself: a signature over every byte, anchored to Bitcoin. Here's exactly how it's made, and how anyone can check it for free."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="flex gap-5">
                  <div className="shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div>
                    <div className={`${serif} text-[13px] font-semibold tracking-wider text-stone-400`}>{s.n}</div>
                    <h3 className="mt-1 text-[17px] font-semibold text-stone-900">{s.h}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">{s.p}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <H2>What tampering looks like</H2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            There are only two ways to change a sealed document, and both are caught:
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <Card>
              <div className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Edit the signed bytes</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
                Change the amount, a name, a date — anything covered by the signature — and the fingerprint no longer
                matches. Verification fails immediately.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-[13px] font-semibold text-red-700 ring-1 ring-inset ring-red-100">
                Tampered — verification fails
              </div>
            </Card>
            <Card>
              <div className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Append after sealing</div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
                Add pages, rewrite metadata, or append bytes (the way tools like exiftool do) and the signature no
                longer covers the whole file. We require full-file coverage, so this is flagged too.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-[13px] font-semibold text-red-700 ring-1 ring-inset ring-red-100">
                Not intact — coverage broken
              </div>
            </Card>
          </div>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-stone-500">
            A document only shows as authentic when it is byte-for-byte identical to what was sealed. Copying a visual
            badge onto a different file doesn&rsquo;t work either — you verify the <em>file</em>, not a picture of a seal.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <H2>What a seal proves</H2>
          <ul className="mt-6 max-w-2xl space-y-3 text-[16px] leading-relaxed text-stone-700">
            <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-blue-600" /> The document existed at a specific time, anchored to Bitcoin.</li>
            <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-blue-600" /> It hasn&rsquo;t changed by a single byte since.</li>
            <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-blue-600" /> Every document from the same issuer traces to the same seal.</li>
          </ul>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            A seal proves the document — its integrity and its moment in time. It ties that document to whoever
            controlled the sealing channel: attribution by control, and every proof page states exactly that.
          </p>
          <div className="mt-6">
            <LinkArrow href="/site/open">See the open standards behind it</LinkArrow>
          </div>
        </Container>
      </section>
    </>
  );
}
