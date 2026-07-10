import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { SiteNav } from "./_components/nav";
import { SiteFooter } from "./_components/footer";

const serif = Newsreader({
  variable: "--font-serif-site",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Let's Seal — free, open proof that any document is real",
  description:
    "A public-benefit project: free, open, decentralised document authenticity. Seal any document and prove it hasn't changed — no company in the middle. Anyone verifies free, forever.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} flex min-h-screen flex-col bg-stone-50 text-stone-900`}>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
