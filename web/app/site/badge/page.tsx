import { PageHead, Container, H2, Card, CodeBlock, Eyebrow, LinkArrow, serif } from "../_components/ui";
import { SealMark } from "@/components/brand/SealMark";
import { Check, X } from "lucide-react";

export const metadata = {
  title: "The badge — Let's Seal",
  description:
    "One recognisable mark, used consistently and always verifiable. How to display the Let's Seal verified badge, embed a live verify widget, and the usage rules that keep it honest.",
};

const BRAND_BLUE = "#2563eb";

const BADGE_SNIPPET = `<!-- Verify badge for one document -->
<div data-letsseal-verify data-hash="<sha256>"></div>
<script src="https://app.letsseal.org/embed.js" async></script>`;

const CHECKER_SNIPPET = `<!-- Drop-a-PDF checker -->
<div data-letsseal-verify></div>
<script src="https://app.letsseal.org/embed.js" async></script>`;

const DO = [
  "Always make the badge open the live verdict — clicking or scanning lands on the real proof.",
  "Keep the mark in Trust Blue (#2563eb); use it at a legible size with clear space around it.",
  "Pair it with the document's fingerprint or a /d/<hash> link, so anyone can check the file itself.",
  "Say what's true: “Sealed & unaltered”, “Issued by <name>”, “Verify at letsseal.org”.",
];

const DONT = [
  "Don't present the badge as proof on its own — a copied image is not a seal. Verify the file.",
  "Don't recolour, redraw, or add effects to the mark, or pair it with a different tick.",
  "Don't imply notarisation or that identity was verified — a seal proves integrity + time, not who.",
  "Don't use it as static decoration with no link to a live, checkable proof.",
];

export default function BadgePage() {
  return (
    <>
      <PageHead
        eyebrow="The badge"
        title="One mark. Everywhere. Always verifiable."
        lede="Every Let's Seal document carries the same mark — stamped into the PDF, on its proof page, and in the embeddable widget. Consistency is what makes it recognisable; the rule that it always links to a live verdict is what keeps it honest."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-20">
          <Eyebrow>The mark</Eyebrow>
          <H2 className="mt-3.5">The verified seal</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            A blue verified-badge with a check — “sealed &amp; verified” in one glyph. Deliberately{" "}
            <strong>blue</strong>, because Adobe&rsquo;s paid AATL seal owns the green tick and we&rsquo;re the free,
            open alternative.
          </p>

          <div className="mt-8 flex flex-wrap items-end gap-10">
            <div className="flex items-end gap-6 rounded-2xl border border-stone-200 bg-white px-8 py-7">
              <SealMark className="h-16 w-16" color={BRAND_BLUE} />
              <SealMark className="h-10 w-10" color={BRAND_BLUE} />
              <SealMark className="h-6 w-6" color={BRAND_BLUE} />
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-8 py-7">
              <div className="flex items-center gap-2.5">
                <SealMark className="h-7 w-7" color={BRAND_BLUE} />
                <span className={`${serif} text-[20px] font-semibold tracking-tight text-stone-900`}>Verified · Let&rsquo;s Seal</span>
              </div>
              <div className="mt-2 text-[12.5px] text-stone-400">The lockup — mark + wordmark</div>
            </div>
            <div className="text-[14px] text-stone-600">
              <div><span className="font-semibold text-stone-900">Trust Blue</span> · <code className="font-mono">#2563eb</code></div>
              <div className="mt-1">Clear space ≥ half the mark&rsquo;s height on all sides.</div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-20">
          <Eyebrow>Put it on your site</Eyebrow>
          <H2 className="mt-3.5">A live verify badge, in one line</H2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            The widget renders in a shadow DOM (no clash with your styles) and calls the public, keyless verify API.
            It always shows a <em>live</em> verdict — never a static image.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="text-[13px] font-semibold text-stone-500">Badge for one document</div>
              <p className="mt-2 mb-3 text-[14px] text-stone-600">Shows “authentic &amp; unaltered”, issuer, and a link to the full proof.</p>
              <CodeBlock>{BADGE_SNIPPET}</CodeBlock>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-stone-500">Drop-a-PDF checker</div>
              <p className="mt-2 mb-3 text-[14px] text-stone-600">Lets a visitor verify any file, right on your page.</p>
              <CodeBlock>{CHECKER_SNIPPET}</CodeBlock>
            </div>
          </div>
          <div className="mt-6">
            <LinkArrow href="https://app.letsseal.org/embed-example.html">See both modes live</LinkArrow>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-14 sm:py-20">
          <Eyebrow>Using it well</Eyebrow>
          <H2 className="mt-3.5">Keep it recognisable, keep it honest</H2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card>
              <div className="text-[13px] font-semibold text-blue-700">Do</div>
              <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-stone-600">
                {DO.map((d) => (
                  <li key={d} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{d}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <div className="text-[13px] font-semibold text-stone-500">Don&rsquo;t</div>
              <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-stone-600">
                {DONT.map((d) => (
                  <li key={d} className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />{d}</li>
                ))}
              </ul>
            </Card>
          </div>
          <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-stone-600">
            The badge is a front door, not the proof. That&rsquo;s the whole design: it invites a check, and the check
            is what carries the weight. <LinkArrow href="/site/trust">See the root of trust</LinkArrow>
          </p>
        </Container>
      </section>
    </>
  );
}
