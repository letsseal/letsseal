import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const serif = "font-[family-name:var(--font-serif-site)]";

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-4xl px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.13em] text-stone-400">{children}</span>
  );
}

export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
}) {
  return (
    <div className="border-b border-stone-200 bg-stone-100/60">
      <Container className="py-14 sm:py-20">
        {eyebrow && (
          <>
            <Eyebrow>{eyebrow}</Eyebrow>
            <div className="h-3.5" />
          </>
        )}
        <h1 className={`${serif} text-[clamp(32px,5vw,48px)] font-medium leading-[1.08] tracking-[-.015em] text-stone-900`}>
          {title}
        </h1>
        {lede && <p className="mt-5 max-w-2xl text-[clamp(16px,1.7vw,19px)] leading-relaxed text-stone-600">{lede}</p>}
      </Container>
    </div>
  );
}

export function Section({
  children,
  className = "",
  muted = false,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <section className={`${muted ? "bg-stone-100/60" : ""} border-b border-stone-200 ${className}`}>
      <Container className="py-14 sm:py-18">{children}</Container>
    </section>
  );
}

export function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`${serif} text-[clamp(24px,3.2vw,32px)] font-medium leading-tight tracking-[-.01em] text-stone-900 ${className}`}>
      {children}
    </h2>
  );
}

export function Btn({
  href,
  children,
  variant = "solid",
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "ghost";
  external?: boolean;
}) {
  const cls =
    variant === "solid"
      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
      : "bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50";
  const Comp: React.ElementType = external ? "a" : Link;
  const extra = external ? { href } : { href };
  return (
    <Comp
      {...extra}
      className={`inline-flex h-11 items-center gap-2 rounded-[11px] px-5 text-[15px] font-semibold transition-colors ${cls}`}
    >
      {children}
    </Comp>
  );
}

export function LinkArrow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1.5 text-[15px] font-semibold text-blue-600">
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-stone-200 bg-stone-900 px-4 py-3.5 font-mono text-[13px] leading-relaxed text-stone-100">
      {children}
    </pre>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-6 ${className}`}>{children}</div>
  );
}
