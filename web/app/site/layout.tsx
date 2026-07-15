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
  metadataBase: new URL("https://letsseal.org"),
  title: "Let's Seal — the open standard for sealing anything",
  description:
    "The open standard for proving any file is authentic: unaltered, sealed by a known certificate, and in existence by a certain date. One standard for every kind of file — documents, images, email, code, containers. Free for everyone, verifiable by anyone, forever.",
};

const SITE_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://letsseal.org/#org",
      name: "Let's Seal",
      url: "https://letsseal.org",
      description:
        "The open standard for sealing anything, so anyone can prove a file is authentic — unaltered, sealed by a known certificate, and in existence by a certain date.",
    },
    {
      "@type": "WebSite",
      "@id": "https://letsseal.org/#website",
      url: "https://letsseal.org",
      name: "Let's Seal",
      publisher: { "@id": "https://letsseal.org/#org" },
    },
  ],
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} flex min-h-screen flex-col bg-stone-50 text-stone-900`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_LD) }} />
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
