export type Post = {
  slug: string;
  title: string;
  eyebrow: string;
  date: string; 
  dateLabel: string; 
  readingTime: string;
  blurb: string;
};

export const POSTS: Post[] = [
  {
    slug: "why-bitcoin",
    title: "Why we anchor proofs to a public ledger",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "6 min read",
    blurb:
      "A seal proves what a file is. Proving when it existed is the harder problem, because a timestamp is only as trustworthy as the clock behind it. Here is why we anchor to a public ledger, a clock everyone shares and no one owns, and how it stays free.",
  },
  {
    slug: "transparency-log",
    title: "The transparency log: a Merkle tree you can check",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "6 min read",
    blurb:
      "Every seal is a leaf in an append-only Merkle tree, the same structure Certificate Transparency and sigstore use. Here is why, and how you can prove for yourself that the log only ever grows.",
  },
  {
    slug: "blue-not-green",
    title: "Why our verified tick is blue",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "5 min read",
    blurb:
      "Adobe's green check means one specific thing: your certificate paid to join a private trust list. We are the free, open alternative, so our mark is blue. Here is exactly what that blue claims, and where it sends you to check.",
  },
  {
    slug: "format-native-signatures",
    title: "One root, six signatures, one per file type",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "6 min read",
    blurb:
      "A PDF, an image, an email and a container image each carry a signature in their own native standard, and every one chains to a single root. Here is why we sign each in its own language, and the one rule that catches tampering.",
  },
  {
    slug: "pinned-root",
    title: "A root CA you pin yourself, by fingerprint",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "6 min read",
    blurb:
      "Most certificate authorities want to live in your operating system and your browser. Ours takes a different path: you pin it yourself, by fingerprint. Here is why that is the more honest design.",
  },
  {
    slug: "proof-codes",
    title: "The 20-character proof code, and why it is random",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "5 min read",
    blurb:
      "Every seal gets a short code like 5X9H-KWF3-JTBC-55CS-6Q6X. It is independent random data, and that is the point: it keeps the document private, and it doubles as an unguessable key to the proof.",
  },
  {
    slug: "open-standard",
    title: "Why Let's Seal is a standard, built to outlive us",
    eyebrow: "Design decisions",
    date: "2026-07-20",
    dateLabel: "20 July 2026",
    readingTime: "5 min read",
    blurb:
      "The spec is CC-BY, the code is Apache-2.0, and verifying a seal runs on public tools alone. Every seal stays checkable on its own, for good. Here is why we built it to outlive us.",
  },
];

export const bySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
