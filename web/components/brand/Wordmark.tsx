import Link from "next/link";
import { cn } from "@/lib/utils";
import { SealMark } from "./SealMark";

export function Wordmark({
  href = "/app",
  size = "md",
  className,
}: { href?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = {
    sm: { mark: "h-6 w-6", text: "text-sm" },
    md: { mark: "h-8 w-8", text: "text-lg" },
    lg: { mark: "h-10 w-10", text: "text-2xl" },
  }[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <SealMark className={s.mark} color="var(--brand)" emboss="#ffffff" />
      <span className={cn("font-semibold tracking-tight text-ink", s.text)}>
        Let&apos;s&nbsp;Seal
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href} className="inline-flex">{inner}</Link>;
}
