import Link from "next/link";
import { cn } from "@/lib/utils";
import { SealMark } from "./SealMark";

export function Wordmark({
  href = "/app",
  size = "md",
  className,
}: { href?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = {
    sm: { mark: "h-[1em] w-[1em]", text: "text-sm" },
    md: { mark: "h-[1em] w-[1em]", text: "text-lg" },
    lg: { mark: "h-[1em] w-[1em]", text: "text-2xl" },
  }[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <SealMark className={s.mark} color="var(--brand)" emboss="#ffffff" />
      <span className={cn("font-bold tracking-[-0.05em] text-ink", s.text)}>
        LetsSeal
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href} className="inline-flex">{inner}</Link>;
}
