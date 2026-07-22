import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, PageHead, serif } from "../_components/ui";
import { POSTS } from "./_posts";

export const metadata = {
  title: "Blog · Let's Seal",
  description:
    "Why Let's Seal is built the way it is. Plain explanations of the decisions behind the standard: the blockchain anchor, the Merkle transparency log, and more.",
};

export default function BlogIndex() {
  return (
    <>
      <PageHead
        eyebrow="Blog"
        title="Why it works the way it does"
        lede="Let's Seal is built from public, boring, checkable standards. These posts explain the decisions behind them, one at a time, and show you how to verify each claim yourself."
      />

      <section>
        <Container className="py-14 sm:py-18">
          <div className="mx-auto max-w-[760px] divide-y divide-stone-200">
            {POSTS.map((p) => (
              <article key={p.slug} className="py-8 first:pt-0">
                <Link href={`/site/blog/${p.slug}`} className="group block">
                  <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                    <span className="text-blue-600">{p.eyebrow}</span>
                    <span aria-hidden>&middot;</span>
                    <time dateTime={p.date} className="tracking-normal normal-case text-stone-400">
                      {p.dateLabel}
                    </time>
                  </div>
                  <h2
                    className={`${serif} mt-2.5 text-[clamp(22px,2.6vw,28px)] font-medium leading-snug tracking-[-.01em] text-stone-900 transition-colors group-hover:text-blue-700`}
                  >
                    {p.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-stone-600">
                    {p.blurb}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-600">
                    Read
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
