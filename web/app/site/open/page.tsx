import { PageHead, Container, H2, serif, Card, CodeBlock, LinkArrow } from "../_components/ui";
import { Check } from "lucide-react";
import { getNetworkStats } from "@/lib/stats";

export const metadata = {
  title: "Open — Let's Seal",
  description:
    "Open source, open standards, open ledger. How Let's Seal stays permanent and independent — with live, honest usage counts.",
};

export const revalidate = 300;

const OPEN = [
  {
    h: "Open source",
    p: "Every part — CLI, SDKs, web app, signing service — is Apache-2.0 licensed on GitHub. Read it, fork it, run it.",
  },
  {
    h: "Open standards",
    p: "PAdES signatures, X.509 certificates, SHA-256, OpenTimestamps — established, audited, and yours to verify against.",
  },
  {
    h: "Open ledger",
    p: "Anchors live on Bitcoin's public blockchain, and every seal is recorded in a public, append-only transparency log. Verification stands on its own, anywhere, forever.",
  },
  {
    h: "Run it yourself, keep your keys",
    p: "Self-host the whole stack and hold your own keys. Your seals stay verifiable forever, by anyone.",
  },
];

export default async function OpenPage() {
  const stats = await getNetworkStats();
  const STATS = [
    { n: stats.documentsSealed.toLocaleString(), l: "Documents sealed" },
    { n: stats.organizations.toLocaleString(), l: "Businesses issuing" },
    { n: stats.standaloneTimestamps.toLocaleString(), l: "Standalone timestamps" },
    { n: stats.latestBlock ? `#${stats.latestBlock.toLocaleString()}` : "—", l: "Latest Bitcoin anchor" },
  ];
  return (
    <>
      <PageHead
        eyebrow="Open by design"
        title="Open source, open standards, open ledger."
        lede="Nothing here is ours to lock up. Let's Seal keeps working even if we don't, because the proof lives in public standards and a public ledger."
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
          <H2 className="mt-3.5">By the numbers, live</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            Live counts from the network&rsquo;s own public proof records — the same ones anyone can pull from a{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-[13px]">/d/&lt;hash&gt;</code> proof page. No
            telemetry, no phone-home. Every number is real, and it climbs as the network grows.
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
              <div className="text-[13px] font-semibold text-blue-700">What the numbers are</div>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-stone-600">
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> A live count of sealed documents on record</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Businesses issuing under the shared root</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Standalone timestamps and the latest Bitcoin anchor</li>
              </ul>
            </Card>
            <Card>
              <div className="text-[13px] font-semibold text-stone-500">What they are not</div>
              <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-stone-600">
                <li>No document contents or filenames — only the count</li>
                <li>No names, emails, accounts, or IP addresses</li>
                <li>Not aggregated from anyone else&rsquo;s server</li>
              </ul>
            </Card>
          </div>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-6">
            <div className="text-[15px] font-semibold text-stone-900">No phone-home to turn off</div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
              These counts come from this network&rsquo;s own public proof records — nothing is collected from you to
              produce them. A self-hosted instance counts its own records locally and reports nothing back to us;
              there is no telemetry to disable because there is none to begin with.
            </p>
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
