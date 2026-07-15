import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container, H2, CodeBlock, Eyebrow, LinkArrow, Btn, serif } from "../../_components/ui";
import { SealFlow } from "../_diagram";
import { BUILT_SECTORS, getSector, PROOF, type Lane } from "../_data";
import { Check, ArrowUpRight } from "lucide-react";

export function generateStaticParams() {
  return BUILT_SECTORS.map((s) => ({ sector: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sector: string }> }): Promise<Metadata> {
  const { sector } = await params;
  const s = getSector(sector);
  if (!s) return { title: "Use cases — Let's Seal" };
  const url = `https://letsseal.org/site/use-cases/${s.slug}`;
  return {
    title: `${s.h1} · Let's Seal`,
    description: s.metaDescription,
    keywords: s.seo,
    alternates: { canonical: url },
    openGraph: { title: `${s.h1} · Let's Seal`, description: s.metaDescription, url, type: "article" },
  };
}

const FLOW: Record<Lane, { input: string; form: string }> = {
  document: { input: "Your signed PDF", form: "PAdES" },
  software: { input: "Your artifact / SBOM", form: "cosign-compatible" },
  media: { input: "Your image or video", form: "C2PA" },
  anyfile: { input: "Your document or file", form: "PAdES / detached CMS" },
};

export default async function SectorPage({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = getSector(sector);
  if (!s) notFound();

  const proofUrl = PROOF[s.slug] || s.example?.proofUrl || "";
  const flow = FLOW[s.lane];

  const LD = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Use cases", item: "https://letsseal.org/site/use-cases" },
          { "@type": "ListItem", position: 2, name: s.name, item: `https://letsseal.org/site/use-cases/${s.slug}` },
        ],
      },
      {
        "@type": "TechArticle",
        headline: s.h1,
        description: s.metaDescription,
        url: `https://letsseal.org/site/use-cases/${s.slug}`,
        publisher: { "@id": "https://letsseal.org/#org" },
      },
      s.faq && s.faq.length
        ? {
            "@type": "FAQPage",
            mainEntity: s.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }
        : null,
    ].filter(Boolean),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />

      <div className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-12 sm:py-16">
          <nav className="mb-4 flex items-center gap-1.5 text-[13px] text-stone-500">
            <Link href="/site/use-cases" className="hover:text-stone-800">Use cases</Link>
            <span aria-hidden>/</span>
            <span className="text-stone-700">{s.name}</span>
          </nav>
          <h1 className={`${serif} max-w-[20ch] text-[clamp(30px,5vw,46px)] font-medium leading-[1.07] tracking-[-.015em] text-stone-900`}>
            {s.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-[clamp(16px,1.7vw,19px)] leading-relaxed text-stone-600">{s.lede}</p>
          <p className="mt-4 text-[14px] text-stone-500">For {s.who.toLowerCase()}.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Btn href="https://app.letsseal.org" external>Open the app <ArrowUpRight className="h-4 w-4" /></Btn>
            <Btn href="/site/developers" variant="ghost">Developer docs</Btn>
          </div>
        </Container>
      </div>

      {s.proves && (
        <section className="border-b border-stone-200">
          <Container className="py-14 sm:py-18">
            <Eyebrow>What a seal proves</Eyebrow>
            <H2 className="mt-3.5">Four guarantees, in {s.name.toLowerCase()}</H2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {s.proves.map((g) => (
                <div key={g.h} className="flex gap-3.5">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                  <div>
                    <h3 className="text-[15.5px] font-semibold text-stone-900">{g.h}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-stone-600">{g.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      )}

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <Eyebrow>How it works</Eyebrow>
          <H2 className="mt-3.5">From your file to a proof anyone can check</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            The same pipeline every time — the seal and the timestamp travel with the file, so the proof is
            self-contained.
          </p>
          <div className="mt-8">
            <SealFlow input={flow.input} form={flow.form} />
          </div>
        </Container>
      </section>

      {s.webSteps && (
        <section className="border-b border-stone-200">
          <Container className="py-14 sm:py-18">
            <Eyebrow>Step by step · the web app</Eyebrow>
            <H2 className="mt-3.5">Seal it in the app — no setup</H2>
            <ol className="mt-8 space-y-6">
              {s.webSteps.map((step, i) => (
                <li key={step.h} className="flex gap-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[15px] font-semibold text-white">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-stone-900">{step.h}</h3>
                    <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-stone-600">{step.p}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      )}

      {s.cli && (
        <section className="border-b border-stone-200 bg-stone-100/60">
          <Container className="py-14 sm:py-18">
            <Eyebrow>Step by step · the CLI</Eyebrow>
            <H2 className="mt-3.5">Automate it from your terminal or CI</H2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
              The <code className="rounded bg-stone-200/70 px-1 py-0.5 font-mono text-[13px]">sealbot</code> CLI does the
              same thing, scriptably — one command per file, straight into your pipeline.
            </p>
            <div className="mt-6">
              <CodeBlock>{s.cli}</CodeBlock>
            </div>
            {s.cliNote && <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-stone-500">{s.cliNote}</p>}
            <div className="mt-6"><LinkArrow href="/site/developers">Full CLI &amp; API reference</LinkArrow></div>
          </Container>
        </section>
      )}

      {s.example && proofUrl && (
        <section className="border-b border-stone-200">
          <Container className="py-14 sm:py-18">
            <Eyebrow>See a real proof</Eyebrow>
            <H2 className="mt-3.5">{s.example.label}</H2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">{s.example.note}</p>
            <div className="mt-6">
              <Btn href={proofUrl} external>Open the live proof <ArrowUpRight className="h-4 w-4" /></Btn>
            </div>
            <p className="mt-4 text-[13px] text-stone-500">A real document, sealed under the “Let&rsquo;s Seal Examples” organisation.</p>
          </Container>
        </section>
      )}
      {s.example && !proofUrl && s.lane === "software" && (
        <section className="border-b border-stone-200">
          <Container className="py-14 sm:py-18">
            <Eyebrow>The proof is reproducible</Eyebrow>
            <H2 className="mt-3.5">{s.example.label}</H2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">{s.example.note}</p>
          </Container>
        </section>
      )}

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <Eyebrow>Common documents</Eyebrow>
              <H2 className="mt-3.5">What you&rsquo;ll seal</H2>
              <ul className="mt-6 flex flex-wrap gap-2">
                {s.documents.map((d) => (
                  <li key={d} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[13.5px] text-stone-700">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
            {s.faq && (
              <div>
                <Eyebrow>Questions</Eyebrow>
                <H2 className="mt-3.5">Straight answers</H2>
                <dl className="mt-6 divide-y divide-stone-200">
                  {s.faq.map((f) => (
                    <div key={f.q} className="py-4 first:pt-0">
                      <dt className="text-[15px] font-semibold text-stone-900">{f.q}</dt>
                      <dd className="mt-1.5 text-[14.5px] leading-relaxed text-stone-600">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="rounded-2xl bg-stone-900 p-8 sm:p-10">
            <h2 className={`${serif} text-[clamp(22px,3vw,30px)] font-medium leading-tight text-white`}>
              Start sealing {s.name.toLowerCase()} documents
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-stone-300">
              Free and open. Seal in the app, automate from the CLI, and hand anyone a proof they can verify themselves.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Btn href="https://app.letsseal.org" external>Open the app <ArrowUpRight className="h-4 w-4" /></Btn>
              <Link href="/site/use-cases" className="inline-flex h-11 items-center gap-2 rounded-[11px] px-5 text-[15px] font-semibold text-stone-300 ring-1 ring-inset ring-stone-700 transition-colors hover:bg-stone-800">
                All use cases
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
