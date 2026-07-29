import { PageHead, Container, H2, Card, LinkArrow } from "../_components/ui";
import { Rocket, Terminal, Boxes, ShieldCheck, Server, BookOpen, FileDown } from "lucide-react";

export const metadata = {
  title: "Docs, Let's Seal",
  description: "Documentation for Let's Seal: quickstarts, the sealbot CLI, the API and SDKs, verification, and self-hosting.",
};

const SECTIONS = [
  {
    icon: Rocket,
    h: "Quickstart",
    p: "Seal and verify your first document in minutes.",
    href: "/site/getting-started",
    links: ["Hosted app", "Command line", "CI/CD"],
  },
  {
    icon: Terminal,
    h: "sealbot CLI",
    p: "Every command, flag, and exit code.",
    href: "https://github.com/letsseal/sealbot",
    links: ["seal", "verify", "attest", "sign-image"],
  },
  {
    icon: Boxes,
    h: "API & SDKs",
    p: "HTTP reference and language SDKs for every seal form.",
    href: "/site/developers",
    links: ["REST API", "Detached", "C2PA", "XML-DSig", "S/MIME", "Attestations"],
  },
  {
    icon: ShieldCheck,
    h: "Verification",
    p: "How public verification works, for anyone.",
    href: "/site/how-it-works",
    links: ["Coverage", "Transparency log", "Blockchain anchor", "Proof pages"],
  },
  {
    icon: Server,
    h: "Self-hosting",
    p: "Run the full stack and hold your own keys.",
    href: "/site/open",
    links: ["Deploy", "Your own CA", "Telemetry opt-out"],
  },
  {
    icon: FileDown,
    h: "Recipes",
    p: "Worked patterns for common jobs.",
    href: "/site/recipes/sealed-downloads",
    links: ["Sealing on download", "Per-copy identity"],
  },
  {
    icon: BookOpen,
    h: "Concepts",
    p: "Use cases, trust model, and honest scope.",
    href: "/site/mission",
    links: ["Provider-verified identity", "Supply-chain attestations", "What a seal proves"],
  },
];

export default function DocsPage() {
  return (
    <>
      <PageHead
        eyebrow="Docs"
        title="Everything you need to build with Let's Seal."
        lede="Start with a quickstart, then go deep on the CLI, API, verification, and self-hosting. All open source."
      />

      <section className="border-b border-stone-200">
        <Container className="py-14 sm:py-18">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.h} className="flex flex-col">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[17px] font-semibold text-stone-900">{s.h}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{s.p}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {s.links.map((l) => (
                      <li key={l} className="rounded-md bg-stone-100 px-2 py-1 text-[12px] font-medium text-stone-500">
                        {l}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 pt-1">
                    <LinkArrow href={s.href}>Open</LinkArrow>
                  </div>
                </Card>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="border-b border-stone-200 bg-stone-100/60">
        <Container className="py-14 sm:py-16">
          <H2>Can&rsquo;t find it?</H2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone-600">
            The docs are open source and improve with every question. Ask in discussions or open a pull request.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <LinkArrow href="https://github.com/letsseal/letsseal/discussions">Ask in discussions</LinkArrow>
            <LinkArrow href="https://github.com/letsseal">Edit the docs on GitHub</LinkArrow>
          </div>
        </Container>
      </section>
    </>
  );
}
