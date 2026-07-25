import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container, Eyebrow, serif } from "../_components/ui";


export function PostHead({
  eyebrow,
  title,
  dateLabel,
  readingTime,
  lede,
}: {
  eyebrow: string;
  title: string;
  dateLabel: string;
  readingTime: string;
  lede: React.ReactNode;
}) {
  return (
    <header className="border-b border-stone-200 bg-stone-100/60">
      <Container className="py-14 sm:py-18">
        <div className="mx-auto max-w-[720px]">
          <Link
            href="/site/blog"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-500 transition-colors hover:text-stone-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Blog
          </Link>
          <div className="mt-6">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h1
            className={`${serif} mt-3.5 text-[clamp(30px,4.4vw,44px)] font-medium leading-[1.1] tracking-[-.015em] text-stone-900`}
          >
            {title}
          </h1>
          <div className="mt-5 flex items-center gap-2 text-[13px] text-stone-500">
            <span>By the Let&rsquo;s Seal team</span>
            <span aria-hidden>&middot;</span>
            <time dateTime={dateLabel}>{dateLabel}</time>
            <span aria-hidden>&middot;</span>
            <span>{readingTime}</span>
          </div>
          <p className="mt-6 text-[clamp(17px,1.8vw,20px)] leading-relaxed text-stone-600">
            {lede}
          </p>
        </div>
      </Container>
    </header>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-14 sm:py-18">
      <div className="mx-auto max-w-[680px]">{children}</div>
    </Container>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 text-[17px] leading-[1.75] text-stone-700">{children}</p>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className={`${serif} mt-12 text-[clamp(22px,2.8vw,28px)] font-medium leading-tight tracking-[-.01em] text-stone-900`}
    >
      {children}
    </h2>
  );
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-stone-900">{children}</strong>;
}

export function Figure({
  caption,
  children,
}: {
  caption: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="mt-9 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
      {children}
      <figcaption className="mt-4 border-t border-stone-100 pt-3 text-[13px] leading-relaxed text-stone-500">
        {caption}
      </figcaption>
    </figure>
  );
}

export function Stats({ items }: { items: { k: string; l: string }[] }) {
  return (
    <div className="mt-9 grid grid-cols-3 gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-6">
      {items.map((s) => (
        <div key={s.l}>
          <div className={`${serif} text-[clamp(22px,3vw,30px)] font-medium leading-none text-blue-600`}>
            {s.k}
          </div>
          <div className="mt-2 text-[12.5px] leading-snug text-stone-500">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

export function PostFooter() {
  return (
    <div className="mt-14 border-t border-stone-200 pt-8">
      <p className="text-[15px] text-stone-600">
        Every claim here is something you can check yourself, offline, with tools we do not
        control. That is the whole point.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/site/standard"
          className="inline-flex h-10 items-center rounded-[11px] bg-blue-600 px-4 text-[14px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Read the standard
        </Link>
        <Link
          href="/site/blog"
          className="inline-flex h-10 items-center rounded-[11px] bg-white px-4 text-[14px] font-semibold text-stone-800 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-50"
        >
          More from the blog
        </Link>
      </div>
    </div>
  );
}
