import { PageHead, Container, H2, serif, Card, CodeBlock, LinkArrow } from "../_components/ui";
import { Check } from "lucide-react";

export const metadata = {
  title: "Open — Let's Seal",
  description:
    "Open source, open standards, open ledger. How Let's Seal stays permanent and independent — and exactly what anonymous usage stats we keep, and how to turn them off.",
};

const OPEN = [
  {
    h: "Open source",
    p: "Every part — CLI, SDKs, web app, signing service — is MIT-licensed on GitHub. Nothing is hidden, nothing is proprietary.",
  },
  {
    h: "Open standards",
    p: "PAdES signatures, X.509 certificates, SHA-256, OpenTimestamps. We compose established standards; we didn't invent a format you'd have to trust.",
  },
  {
    h: "Open ledger",
    p: "Anchors live on Bitcoin's public blockchain. Verification doesn't depend on our servers being online — or on us existing at all.",
  },
  {
    h: "No lock-in",
    p: "Self-host and hold your own keys. Your seals stay verifiable forever, by anyone, with no permission from us.",
  },
];

const STATS = [
  { n: "1.24M", l: "Documents sealed" },
  { n: "4.8M", l: "Verifications" },
  { n: "340", l: "Self-hosted instances" },
  { n: "62", l: "Countries" },
];

export default function OpenPage() {
  return (
    <>
      <PageHead
        eyebrow="Open by design"
        title="Open source, open standards, open ledger."
        lede="Nothing here is ours to lock up. The point of Let's Seal is that it keeps working even if we don't — because the proof lives in public standards and a public ledger."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {OPEN.map((o) => (
              <div key={o.h} className="flex gap-4">
                <Check className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
                <div>
                  <h3 className="text-[17px] font-semibold text-stone-900">{o.h}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">{o.p}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <H2>Run the whole thing yourself</H2>
              <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                Clone, configure, deploy. You get your own signing keys and full control — issue seals no one can
                revoke or paywall.
              </p>
              <div className="mt-5">
                <LinkArrow href="https://github.com/letsseal/letsseal">letsseal/letsseal on GitHub</LinkArrow>
              </div>
            </div>
            <CodeBlock>
{`git clone https://github.com/letsseal/letsseal
cd letsseal
cp .env.example .env   # add your CA + config
./deploy.sh            # up on your own domain`}
            </CodeBlock>
          </div>
        </Container>
      </section>

      <section id="stats" className="scroll-mt-20 border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <span className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-400">Transparency</span>
          <H2 className="mt-3.5">By the numbers — and how we count</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            To run this well and show it&rsquo;s used, we keep a small set of anonymous, aggregate counts — even across
            self-hosted instances. It is deliberately impossible for these stats to identify anyone or reveal any
            document.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l}>
                <div className={`${serif} text-[32px] font-medium leading-none tracking-tight`}>{s.n}</div>
                <div className="mt-2 text-[13.5px] text-stone-500">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <Card>
              <div className="text-[13px] font-semibold text-blue-700">What we count</div>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-stone-600">
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Number of documents sealed and verified</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Number of active instances and rough region</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Version numbers, to know what&rsquo;s in use</li>
              </ul>
            </Card>
            <Card>
              <div className="text-[13px] font-semibold text-stone-500">What we never touch</div>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-stone-600">
                <li>No document contents, filenames, or hashes</li>
                <li>No names, emails, accounts, or IP addresses</li>
                <li>No content that could identify a person or organisation</li>
              </ul>
            </Card>
          </div>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-6">
            <div className="text-[15px] font-semibold text-stone-900">On by default, off with one flag</div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
              Stats are on by default because they&rsquo;re counts only — never personal data — and they genuinely help
              us keep the project healthy. If you&rsquo;d rather send nothing, opt out completely:
            </p>
            <div className="mt-4">
              <CodeBlock>
                <span className="text-stone-500"># in your .env</span>
                {"\n"}
                LETSSEAL_TELEMETRY=off
              </CodeBlock>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <H2>Get involved</H2>
          <div className="mt-6 flex flex-col gap-3">
            <LinkArrow href="https://github.com/letsseal">Contribute on GitHub</LinkArrow>
            <LinkArrow href="https://github.com/letsseal/letsseal/discussions">Join the discussion</LinkArrow>
            <LinkArrow href="/site/mission">Read the mission</LinkArrow>
          </div>
        </Container>
      </section>
    </>
  );
}
