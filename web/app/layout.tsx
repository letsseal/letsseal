import type { Metadata } from "next";
import { Geist, Geist_Mono, Dancing_Script, Great_Vibes, Caveat, Sacramento } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sig1 = Dancing_Script({ variable: "--font-sig-1", subsets: ["latin"], weight: "600" });
const sig2 = Great_Vibes({ variable: "--font-sig-2", subsets: ["latin"], weight: "400" });
const sig3 = Caveat({ variable: "--font-sig-3", subsets: ["latin"], weight: "600" });
const sig4 = Sacramento({ variable: "--font-sig-4", subsets: ["latin"], weight: "400" });

import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "docsigner",
  description: "Multi-business document signing with your own cryptographic seal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sig1.variable} ${sig2.variable} ${sig3.variable} ${sig4.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
