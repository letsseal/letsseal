import { PageHead, Container, H2, serif, CodeBlock, LinkArrow } from "../_components/ui";
import { GettingStartedAccordion } from "../_components/getting-started";

export const metadata = {
  title: "Get started — Let's Seal",
  description:
    "Seal your first document in minutes. Use the hosted app, the sealbot CLI, CI/CD, or run the whole stack yourself.",
};

const TIERS = [
  {
    tier: "Use ours",
    h: "Hosted",
    p: "Drop in any file — PDF, image, XML, email, archive — or run one command, and get a sealed, anchored copy with a public proof page anyone can check.",
    who: "Best for: trying it out, one-off documents, small teams.",
  },
  {
    tier: "Run your own",
    h: "Self-hosted",
    p: "Host the whole stack and hold your own keys. Your seals stay verifiable forever — the proof lives on Bitcoin and the public transparency log.",
    who: "Best for: organisations issuing at scale who want to own their CA and their keys.",
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <PageHead
        eyebrow="Getting started"
        title="Seal your first document in minutes."
        lede="Everything here works today, for free. Pick the path that fits — hosted app, command line, CI pipeline, or your own server."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-5 sm:grid-cols-2">
            {TIERS.map((t) => (
              <div key={t.tier} className="rounded-2xl border border-stone-200 bg-white p-6">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                  {t.tier}
                </span>
                <h3 className={`${serif} mt-4 text-[22px] font-medium tracking-tight`}>{t.h}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-stone-600">{t.p}</p>
                <p className="mt-3 text-[13px] text-stone-500">{t.who}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <H2>Choose your path</H2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Expand any step below. Each is self-contained — you don&rsquo;t need the others.
          </p>
          <div className="mt-8">
            <GettingStartedAccordion />
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <H2>Install sealbot</H2>
              <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                sealbot is the open command-line tool for sealing, anchoring, and verifying anything — files, PDFs,
                media, and software artifacts. It talks to the hosted service by default, or to your own instance with
                one flag.
              </p>
              <div className="mt-5">
                <LinkArrow href="/site/developers">Full developer docs</LinkArrow>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">Install</div>
                <CodeBlock>
                  <span className="text-emerald-400">$</span> brew install letsseal/tap/sealbot
                  {"\n"}
                  <span className="text-stone-500"># or: npm i -g @letsseal/sealbot</span>
                </CodeBlock>
              </div>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">Seal any file</div>
                <CodeBlock>
                  <span className="text-emerald-400">$</span> sealbot seal invoice.pdf
                  {"\n"}
                  <span className="text-stone-500">✓ sealed · anchored to Bitcoin · logged</span>
                  {"\n"}
                  <span className="text-stone-500">→ https://letsseal.org/d/9f2c…a41b</span>
                </CodeBlock>
              </div>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">Verify one (public, keyless)</div>
                <CodeBlock>
                  <span className="text-emerald-400">$</span> sealbot verify invoice.pdf
                  {"\n"}
                  <span className="text-blue-400">✓ authentic · unchanged since sealing</span>
                </CodeBlock>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <H2>Where to next</H2>
          <div className="mt-6 flex flex-col gap-3">
            <LinkArrow href="/site/how-it-works">How a seal is made &amp; checked</LinkArrow>
            <LinkArrow href="/site/developers">Automate it: API, SDKs &amp; CI</LinkArrow>
            <LinkArrow href="/site/open">Self-host &amp; the open standards behind it</LinkArrow>
          </div>
        </Container>
      </section>
    </>
  );
}
