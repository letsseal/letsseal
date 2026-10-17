import Link from "next/link";
import { cn } from "@/lib/utils";
import { SealMark } from "./SealMark";

export function Wordmark({
  href = "/app",
  size = "md",
  className,
}: { href?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = {
    sm: { mark: "size-4", text: "text-sm" },
    md: { mark: "size-5", text: "text-base" },
    lg: { mark: "size-7", text: "text-2xl" },
  }[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <SealMark className={s.mark} color="var(--foreground)" emboss="var(--background)" />
      <span className={cn("font-semibold tracking-tight text-foreground", s.text)}>
        LetsSeal
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href} className="inline-flex">{inner}</Link>;
}
