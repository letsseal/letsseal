import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify a document · Let's Seal",
  description:
    "Check that any Let's Seal document is authentic and unaltered. Free, no account, and independently verifiable offline — the public portal for document authenticity.",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
