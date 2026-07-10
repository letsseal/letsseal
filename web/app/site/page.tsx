import { Check, Users, Code2 } from "lucide-react";
import { Container, Eyebrow, H2, Btn, LinkArrow, serif } from "./_components/ui";
import { GettingStartedAccordion } from "./_components/getting-started";

const STATS = [
  { n: "1.24M", l: "Documents sealed" },
  { n: "4.8M", l: "Verifications, no account" },
  { n: "340", l: "Instances self-hosting" },
  { n: "£0", l: "Charged, to anyone, ever" },
];

export default function SiteHome() {
  return (
    <>
      <section className="border-b border-stone-200">
        <Container className="py-[clamp(46px,7vw,88px)]">
          <Eyebrow>A public-benefit project</Eyebrow>
          <h1 className={`${serif} mt-5 max-w-[15ch] text-[clamp(38px,6.4vw,64px)] font-medium leading-[1.04] tracking-[-.02em]`}>
            Proof that a document is real should belong to everyone.
          </h1>
          <p className="mt-6 max-w-[600px] text-[clamp(17px,1.8vw,20px)] leading-relaxed text-stone-600">
            Let&rsquo;s Seal is a free, open, and decentralised way to seal a document and prove it hasn&rsquo;t changed.
            There&rsquo;s no company in the middle to trust, to pay, or to shut it down — the proof stands on its own, and
            anyone can check it.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Btn href="/site/mission">Read the mission</Btn>
            <LinkArrow href="/site/docs">Documentation</LinkArrow>
            <LinkArrow href="/site/open">Self-host it</LinkArrow>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {["Free to seal & verify, forever", "Open source, MIT", "No company to trust"].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 text-[13.5px] font-medium text-stone-600">
                <Check className="h-4 w-4 text-blue-600" /> {t}
              </span>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Eyebrow>Getting started</Eyebrow>
              <H2 className="mt-3.5">Start sealing in minutes</H2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-stone-600">
                Let&rsquo;s Seal is free, open infrastructure for proving a document is genuine. Use the hosted app, the
                command line, or run the whole thing yourself — everything below works today, for free.
              </p>
              <div className="mt-6">
                <LinkArrow href="/site/getting-started">Full getting-started guide</LinkArrow>
              </div>
            </div>
            <GettingStartedAccordion />
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <Users className="h-6 w-6 text-blue-600" />
              <h3 className="mt-4 text-[17px] font-semibold">For people</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
                Send documents for signature, issue branded certificates and credentials, and seal what you already
                have — from a hosted app.
              </p>
              <div className="mt-4">
                <LinkArrow href="https://app.letsseal.org">Open the app</LinkArrow>
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <Code2 className="h-6 w-6 text-blue-600" />
              <h3 className="mt-4 text-[17px] font-semibold">For developers</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">
                Seal and anchor from the CLI, your CI pipeline, or any language with sealbot, the API, and the SDKs.
                Verification is public and keyless.
              </p>
              <div className="mt-4">
                <LinkArrow href="/site/developers">Developer docs</LinkArrow>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.l}>
                <div className={`${serif} text-[32px] font-medium leading-none tracking-tight`}>{s.n}</div>
                <div className="mt-2 text-[13.5px] text-stone-500">{s.l}</div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[13px] text-stone-400">
            Aggregate, anonymous — no personal data, ever.{" "}
            <a href="/site/open#stats" className="font-semibold text-blue-600">How we count →</a>
          </p>
        </Container>
      </section>
    </>
  );
}
