import { PageHead, Container, H2, serif, LinkArrow } from "../_components/ui";
import { XowxWordmark } from "../_components/xowx-wordmark";

export const metadata = {
  title: "Mission — Let's Seal",
  description:
    "Proof that a document is real should belong to everyone. A public-benefit project making document authenticity free, open, and permanent.",
};

const PRINCIPLES = [
  {
    h: "Authenticity is infrastructure",
    p: "Knowing a document is genuine shouldn't depend on paying a vendor, trusting a brand, or hoping a server stays online. It should be a property of the document itself — checkable by anyone, anywhere.",
  },
  {
    h: "Proof that stands on its own",
    p: "A seal is permanent proof — issued once, yours forever. Verification is keyless and public, so anyone can check any seal, free and instantly. Even if this project vanished, every seal ever made stays verifiable.",
  },
  {
    h: "Open, all the way down",
    p: "The code is open source. The formats are open standards — PAdES signatures, X.509 certificates, OpenTimestamps. The anchor is Bitcoin's public ledger. Nothing here is ours to lock up.",
  },
  {
    h: "Free, and it stays free",
    p: "Sealing is free. Verifying is free. It will not become free-for-now-then-metered. Sustainability, if we need it, comes from optional hosted convenience — never from charging for the truth.",
  },
];

export default function MissionPage() {
  return (
    <>
      <PageHead
        eyebrow="Why Let's Seal exists"
        title={<>Authenticity is infrastructure.<br />It shouldn&rsquo;t be for rent.</>}
        lede="Today, proving a file is genuine means paying to join a private trust list: a members-only club that rents you credibility by the year and makes verification depend on one vendor and one PDF reader. That isn't trust. It's a tollbooth on something the world needs freely."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <div className="max-w-2xl space-y-6 text-[17px] leading-[1.7] text-stone-700">
            <p>
              Every day, decisions turn on documents — a contract, a diploma, an invoice, a permit, a medical record.
              And every day it gets easier to fabricate one that looks perfect. The usual answer is to trust a logo: a
              green badge, a paid seal, a name you&rsquo;re supposed to recognise.
            </p>
            <p>
              We think that&rsquo;s backwards. Trusting a badge means trusting whoever sells the badge. Real proof
              shouldn&rsquo;t need a middleman, a fee, or your faith in a brand. It should be something anyone can check
              for themselves, for free, forever.
            </p>
            <p className={`${serif} text-[22px] font-medium leading-snug tracking-[-.01em] text-stone-900`}>
              Proof that a document is real should belong to everyone.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <H2>What we stand on</H2>
          <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {PRINCIPLES.map((pr) => (
              <div key={pr.h}>
                <h3 className="text-[17px] font-semibold text-stone-900">{pr.h}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-stone-600">{pr.p}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <div className="grid items-center gap-10 sm:grid-cols-[1.5fr_1fr]">
            <div>
              <H2>Run by a foundation, not a startup.</H2>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-stone-600">
                Let&rsquo;s Seal is stewarded by Experimental Open Works — a home for free, public-benefit
                infrastructure, the way ISRG runs Let&rsquo;s Encrypt. No investors, no exit, no plan to enclose it
                later. It&rsquo;s built to outlive us.
              </p>
              <div className="mt-5">
                <LinkArrow href="https://xowx.org">Experimental Open Works</LinkArrow>
              </div>
            </div>
            <a href="https://xowx.org" className="group justify-self-start sm:justify-self-center">
              <span className="mb-3 block text-[10.5px] font-medium uppercase tracking-wider text-stone-400">A project of</span>
              <XowxWordmark className="text-[30px] text-stone-700 transition-colors group-hover:text-stone-900" />
            </a>
          </div>
        </Container>
      </section>

      <section className="bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-md">
              <H2>See how it holds up</H2>
              <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                Proof, not trust — that&rsquo;s the point. Read exactly how a seal is made and how anyone can check it.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <LinkArrow href="/site/how-it-works">How it works</LinkArrow>
              <LinkArrow href="/site/open">Open by design</LinkArrow>
              <LinkArrow href="/site/getting-started">Get started</LinkArrow>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
