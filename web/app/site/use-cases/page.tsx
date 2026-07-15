import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, Container, H2, Eyebrow, serif } from "../_components/ui";
import { SECTORS, JOBS, FORMS } from "./_data";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Use cases — who seals files, and how · Let's Seal",
  description:
    "How every sector uses Let's Seal to prove a file is authentic, unaltered, from a known issuer, and existed at a point in time — law, insurance, software, compliance, and more. Free, open, verifiable by anyone.",
  alternates: { canonical: "https://letsseal.org/site/use-cases" },
};

const HUB_LD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Let's Seal use cases",
  url: "https://letsseal.org/site/use-cases",
  description:
    "How every sector uses Let's Seal to prove a file is authentic, unaltered, from a known issuer, and existed at a point in time.",
  isPartOf: { "@id": "https://letsseal.org/#website" },
};

export default function UseCasesHub() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HUB_LD) }} />
      <PageHead
        eyebrow="Use cases"
        title="Who needs a seal? Almost everyone who issues a file."
        lede="Let's Seal proves any file is authentic, unaltered, from a known issuer, and existed at a point in time — verifiable by anyone, for free. Here's how that lands in your sector, step by step, in the app and from the CLI."
      />

      <section className="border-b border-stone-200">
        <Container className="py-12 sm:py-14">
          <Eyebrow>One standard, every file type</Eyebrow>
          <H2 className="mt-3.5">Whatever you issue, there&rsquo;s a seal for it</H2>
          <div className="mt-7 flex flex-wrap gap-2.5">
            {FORMS.map((f) => (
              <div key={f.for} className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[13.5px]">
                <span className="font-semibold text-stone-900">{f.for}</span>
                <span className="text-stone-400"> → </span>
                <span className="font-mono text-[12.5px] text-blue-700">{f.form}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <Eyebrow>By sector</Eyebrow>
          <H2 className="mt-3.5">Find your sector</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Each guide walks the sector through sealing and verifying its own documents — with a workflow diagram, the
            web-app and CLI steps, worked examples, and a live proof. Don&rsquo;t see yours? The same seal fits any file.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECTORS.map((s) =>
              s.built ? (
                <Link
                  key={s.slug}
                  href={`/site/use-cases/${s.slug}`}
                  className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-5 transition-colors hover:border-blue-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`${serif} text-[19px] font-medium tracking-tight text-stone-900`}>{s.name}</h3>
                    <ArrowRight className="h-4 w-4 shrink-0 text-blue-600 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">{s.who}</p>
                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {s.documents.slice(0, 4).map((d) => (
                      <li key={d} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11.5px] text-stone-500">{d}</li>
                    ))}
                  </ul>
                  <span className="mt-4 text-[12.5px] font-semibold text-blue-600">Read the guide</span>
                </Link>
              ) : (
                <div key={s.slug} className="flex flex-col rounded-2xl border border-stone-200/70 bg-white/50 p-5">
                  <h3 className={`${serif} text-[19px] font-medium tracking-tight text-stone-500`}>{s.name}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-stone-400">{s.who}</p>
                  <ul className="mt-3.5 flex flex-wrap gap-1.5">
                    {s.documents.slice(0, 4).map((d) => (
                      <li key={d} className="rounded-md bg-stone-100/70 px-2 py-0.5 text-[11.5px] text-stone-400">{d}</li>
                    ))}
                  </ul>
                  <span className="mt-4 text-[12.5px] font-medium text-stone-400">Guide on the way</span>
                </div>
              )
            )}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <Eyebrow>Cross-sector</Eyebrow>
          <H2 className="mt-3.5">Ten reasons anyone seals a file</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Every guide above is some combination of these jobs — delivered in the file&rsquo;s own native format.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {JOBS.map((j) => (
              <div key={j.n} className="flex gap-4 rounded-xl border border-stone-200 bg-white p-5">
                <div className="font-mono text-[13px] font-semibold text-blue-600">{j.n}</div>
                <div>
                  <h3 className="text-[15px] font-semibold text-stone-900">{j.h}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{j.p}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="rounded-2xl bg-stone-900 p-8 sm:p-10">
            <Eyebrow>Your headline market</Eyebrow>
            <h2 className={`${serif} mt-3.5 text-[clamp(24px,3.2vw,32px)] font-medium leading-tight text-white`}>
              Anyone issuing documents at volume
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-300">
              The biggest lane: organisations that already generate statements, certificates, policies, invoices, and
              reports. Sealing drops into the existing pipeline — API, CLI, or a watched folder — so every file leaves
              already sealed, timestamped, and carrying a proof link. The recipient gets a normal document that also
              verifies.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              {[
                { b: "Drop-in", t: "One API call or CLI command per document" },
                { b: "At scale", t: "Thousands a day, watched-folder or batch" },
                { b: "Free & native", t: "No per-seal fee; recipients get a normal file that verifies" },
              ].map((c) => (
                <div key={c.b}>
                  <div className="font-mono text-[12px] font-semibold uppercase tracking-wider text-blue-400">{c.b}</div>
                  <div className="mt-1.5 text-[14px] leading-relaxed text-stone-300">{c.t}</div>
                </div>
              ))}
            </div>
            <div className="mt-7">
              <Link href="/site/developers" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-blue-400">
                See how to automate it <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
