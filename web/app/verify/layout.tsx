import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify a document · Let's Seal",
  description:
    "Check that a Let's Seal document is authentic and unaltered. Free, public, and verifiable offline with standard tools.",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
