"use client";

import { useState } from "react";
import { Plus, Minus, Stamp, Terminal, Server, MessageCircle, ArrowRight, ArrowUpRight } from "lucide-react";

type Item = {
  key: string;
  icon: React.ElementType;
  title: string;
  body: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    key: "seal",
    icon: Stamp,
    title: "Seal your first document",
    body: (
      <div className="space-y-4">
        <p>
          The fastest way to try it. Seal a document so anyone can prove it&rsquo;s genuine and unchanged, free, no
          account needed to verify.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-[13px] font-semibold text-stone-900">In the hosted app</div>
            <p className="mt-1 text-[13px] text-stone-600">Drop a PDF, get a sealed + anchored copy with a public proof page.</p>
            <a href="https://app.letsseal.org" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600">
              Open the app <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-[13px] font-semibold text-stone-900">From the command line</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-stone-900 px-3 py-2 font-mono text-[12.5px] text-stone-100">
              <span className="text-emerald-400">$</span> sealbot seal invoice.pdf
            </pre>
            <p className="mt-2 text-[12px] text-stone-500">→ sealed · anchored to the blockchain · public proof link</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "ci",
    icon: Terminal,
    title: "Automate it in your pipeline",
    body: (
      <div className="space-y-3">
        <p>Seal releases, reports, or generated documents automatically in CI/CD with the sealbot GitHub Action.</p>
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-stone-100">
{`- uses: letsseal/sealbot-action@v1
  with:
    mode: seal
    files: dist/**/*.pdf`}
        </pre>
        <a href="/site/developers" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600">
          Developer docs <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    ),
  },
  {
    key: "selfhost",
    icon: Server,
    title: "Run your own (self-host)",
    body: (
      <div className="space-y-3">
        <p>
          Host the whole stack yourself and keep your own keys, issue seals no one can revoke or paywall. Even if
          letsseal.org disappeared, your seals stay verifiable, because the proof lives on the blockchain.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-stone-100">
{`git clone https://github.com/letsseal/letsseal
cd letsseal && ./deploy.sh`}
        </pre>
        <p className="text-[13px] text-stone-500">
          Anonymous, aggregate usage stats are on by default (counts only, never document content or personal data)
          and can be turned off with one flag. <a href="/site/open" className="font-semibold text-blue-600">More on that →</a>
        </p>
      </div>
    ),
  },
  {
    key: "help",
    icon: MessageCircle,
    title: "Get help from the community",
    body: (
      <div className="space-y-3">
        <p>Questions, ideas, or want to contribute? The project is open and welcomes it.</p>
        <div className="flex flex-wrap gap-3">
          <a href="https://github.com/letsseal/letsseal/discussions" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600">
            Discussions <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <a href="https://github.com/letsseal/letsseal/issues" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600">
            Report an issue <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    ),
  },
];

export function GettingStartedAccordion() {
  const [open, setOpen] = useState<string>("seal");
  return (
    <div className="space-y-3">
      {ITEMS.map((item) => {
        const isOpen = open === item.key;
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              isOpen ? "border-blue-300 bg-white" : "border-stone-200 bg-stone-100/70"
            }`}
          >
            <button
              onClick={() => setOpen(isOpen ? "" : item.key)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <Icon className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="flex-1 text-[16px] font-semibold text-stone-900">{item.title}</span>
              {isOpen ? <Minus className="h-5 w-5 text-stone-400" /> : <Plus className="h-5 w-5 text-stone-400" />}
            </button>
            {isOpen && <div className="px-5 pb-6 pt-1 text-[14.5px] leading-relaxed text-stone-600">{item.body}</div>}
          </div>
        );
      })}
    </div>
  );
}
