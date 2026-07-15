import { PageHead, Container, H2, serif, CodeBlock, Card, LinkArrow } from "../_components/ui";
import { Terminal, Boxes, GitBranch, Webhook } from "lucide-react";

export const metadata = {
  title: "Developers — Let's Seal",
  description:
    "Seal anything — files, PDFs, images, XML, email, and software artifacts — from the CLI, CI/CD, the HTTP API, or the SDKs. Anyone verifies publicly. Everything is open source, Apache-2.0.",
};

const SDKS = [
  { lang: "JavaScript / TypeScript", pkg: "npm i @letsseal/sdk" },
  { lang: "Python", pkg: "pip install letsseal" },
  { lang: "Go", pkg: "go get github.com/letsseal/go-letsseal" },
  { lang: "HTTP", pkg: "curl -F file=@x app.letsseal.org/api/v1/verify" },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHead
        eyebrow="Developers"
        title="Seal and verify from anywhere in your stack."
        lede="A CLI, a GitHub Action, an HTTP API, and SDKs — all open source, Apache-2.0. Seal any file behind your API key or your own instance; anyone verifies publicly."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                <Terminal className="h-5 w-5" />
              </div>
              <H2 className="mt-5">sealbot, the CLI</H2>
              <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                The core tool for humans and scripts alike. Seal, anchor, and verify anything — PDFs, images, XML,
                email, or any file — from your terminal. <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[13px]">sealbot seal</code> picks
                the right form for each file type. Point it at the hosted service or your own instance with <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[13px]">--api</code>.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <LinkArrow href="https://github.com/letsseal/sealbot">sealbot on GitHub</LinkArrow>
                <LinkArrow href="/site/docs">CLI reference</LinkArrow>
              </div>
            </div>
            <div className="space-y-4">
              <CodeBlock>
                <span className="text-emerald-400">$</span> sealbot seal report.pdf
                {"\n"}
                <span className="text-emerald-400">$</span> sealbot seal photo.jpg
                {"\n"}
                <span className="text-emerald-400">$</span> sealbot verify report.pdf
                {"\n"}
                <span className="text-emerald-400">$</span> sealbot seal *.pdf --api https://seal.acme.internal
              </CodeBlock>
              <p className="text-[13px] text-stone-500">
                Verification is public — anyone re-hashes the file and checks the signature, the transparency log, and
                the Bitcoin anchor.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
              <GitBranch className="h-5 w-5" />
            </div>
            <H2>In your pipeline</H2>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-[15px] leading-relaxed text-stone-600">
                Seal release artefacts, reports, or generated PDFs automatically with the GitHub Action. Every build
                ships documents anyone can prove are genuine.
              </p>
            </div>
            <CodeBlock>
{`- uses: letsseal/sealbot-action@v1
  with:
    mode: seal
    files: dist/**/*.pdf
    # LETSSEAL_TOKEN in repo secrets`}
            </CodeBlock>
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
              <Boxes className="h-5 w-5" />
            </div>
            <H2>API &amp; SDKs</H2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SDKS.map((s) => (
              <Card key={s.lang} className="flex flex-col gap-3">
                <div className="text-[14px] font-semibold text-stone-900">{s.lang}</div>
                <code className="overflow-x-auto rounded-lg bg-stone-900 px-3 py-2 font-mono text-[12.5px] text-stone-100">
                  {s.pkg}
                </code>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-[14px] leading-relaxed text-stone-500">
            The verify endpoint is public and unauthenticated by design. The seal endpoint holds signing keys and is
            protected — on the hosted service it&rsquo;s tied to your account; when self-hosting it never leaves your
            network.
          </p>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                  <Webhook className="h-5 w-5" />
                </div>
                <H2>Everything is open</H2>
              </div>
              <p className="text-[15px] leading-relaxed text-stone-600">
                sealbot, the SDKs, the web app, and the signing service are all open source under the{" "}
                <span className="font-semibold text-stone-700">letsseal</span> organisation on GitHub. Read it, fork it,
                run it, contribute back.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <LinkArrow href="https://github.com/letsseal">github.com/letsseal</LinkArrow>
              <LinkArrow href="/site/open">How the project stays open</LinkArrow>
              <LinkArrow href="/site/getting-started">Get started</LinkArrow>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
