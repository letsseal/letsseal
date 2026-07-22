import Link from "next/link";
import { XowxWordmark } from "./xowx-wordmark";

const COLS = [
  {
    h: "Project",
    links: [
      { label: "Mission", href: "/site/mission" },
      { label: "Blog", href: "/site/blog" },
      { label: "The SEAL standard", href: "/site/standard" },
      { label: "How it works", href: "/site/how-it-works" },
      { label: "Use cases", href: "/site/use-cases" },
      { label: "Root of trust", href: "/site/trust" },
      { label: "Open", href: "/site/open" },
    ],
  },
  {
    h: "Build",
    links: [
      { label: "Get started", href: "/site/getting-started" },
      { label: "Developers", href: "/site/developers" },
      { label: "Docs", href: "/site/docs" },
      { label: "GitHub", href: "https://github.com/letsseal" },
    ],
  },
  {
    h: "Use",
    links: [
      { label: "Verify a document", href: "/verify" },
      { label: "The badge", href: "/site/badge" },
      { label: "The hosted app", href: "https://app.letsseal.org" },
      { label: "Self-host", href: "/site/open" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-stone-100/70">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="text-[19px] font-semibold tracking-tight text-stone-900">Let&rsquo;s Seal</div>
            <p className="mt-3 max-w-[280px] text-[14px] leading-relaxed text-stone-500">
              Free, open infrastructure for document authenticity. A public-benefit project, secured by nobody,
              verifiable by anyone.
            </p>
            <a href="https://xowx.org" className="group mt-8 inline-flex flex-col gap-2">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-stone-400">A project of</span>
              <XowxWordmark className="text-[19px] text-stone-600 transition-colors group-hover:text-stone-900" />
            </a>
          </div>
          {COLS.map((c) => (
            <div key={c.h}>
              <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider text-stone-400">{c.h}</div>
              <ul className="space-y-2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[14px] text-stone-600 hover:text-stone-900">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-6 text-[13px] text-stone-400">
          <span>© 2026 Let&rsquo;s Seal · Open source (Apache-2.0) · a public-benefit project</span>
          <span>The open standard for sealing anything, proof any file is real, verifiable by anyone, forever.</span>
        </div>
      </div>
    </footer>
  );
}
