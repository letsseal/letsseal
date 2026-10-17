import type { Metadata } from "next";
import { headers } from "next/headers";
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
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Let's Seal",
  description: "Seal and verify documents with your own cryptographic seal — the free, open alternative to pay-to-play AATL.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sig1.variable} ${sig2.variable} ${sig3.variable} ${sig4.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider nonce={nonce} attribute="class" storageKey="ls-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
