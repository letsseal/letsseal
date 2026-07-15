"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowUpRight } from "lucide-react";

export const NAV = [
  { href: "/site/how-it-works", label: "How it works" },
  { href: "/site/use-cases", label: "Use cases" },
  { href: "/site/standard", label: "Standard" },
  { href: "/site/developers", label: "Developers" },
  { href: "/site/open", label: "Open" },
  { href: "/site/docs", label: "Docs" },
];

function SealMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="16" cy="14" r="9" fill="#2563EB" />
      <path d="M12 14l3 3 5-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 21l-2 7 7-3 7 3-2-7" fill="#2563EB" />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-40 bg-stone-50/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-7 px-6">
        <Link href="/site" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <SealMark className="h-7 w-7" />
          <span className="text-[19px]">Let&rsquo;s Seal</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-[14.5px] font-medium transition-colors ${
                active(n.href) ? "text-stone-900" : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-4 md:flex">
          <Link href="/verify" className="text-[14px] font-medium text-stone-500 hover:text-stone-900">
            Verify a document
          </Link>
          <a
            href="https://app.letsseal.org"
            className="inline-flex items-center gap-1 text-[14px] font-medium text-stone-600 hover:text-stone-900"
          >
            Open the app <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <button
          className="ml-auto rounded-md p-2 text-stone-600 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-stone-200 bg-stone-50 px-6 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-2 py-2 text-[15px] font-medium ${
                  active(n.href) ? "bg-blue-50 text-blue-700" : "text-stone-700"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-1 border-t border-stone-200 pt-2">
              <Link href="/verify" onClick={() => setOpen(false)} className="px-2 py-2 text-[15px] text-stone-700">
                Verify a document
              </Link>
              <a href="https://app.letsseal.org" className="px-2 py-2 text-[15px] text-stone-700">
                Open the app →
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
