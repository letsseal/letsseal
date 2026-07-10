import { cn } from "@/lib/utils";

const BADGE =
  "M 50.00 9.00 A 10.61 10.61 0 0 1 70.50 14.49 A 10.61 10.61 0 0 1 85.51 29.50 A 10.61 10.61 0 0 1 91.00 50.00 A 10.61 10.61 0 0 1 85.51 70.50 A 10.61 10.61 0 0 1 70.50 85.51 A 10.61 10.61 0 0 1 50.00 91.00 A 10.61 10.61 0 0 1 29.50 85.51 A 10.61 10.61 0 0 1 14.49 70.50 A 10.61 10.61 0 0 1 9.00 50.00 A 10.61 10.61 0 0 1 14.49 29.50 A 10.61 10.61 0 0 1 29.50 14.49 A 10.61 10.61 0 0 1 50.00 9.00 Z";

export function SealMark({
  className,
  color = "var(--brand)",
  emboss = "#ffffff",
  ...props
}: React.SVGProps<SVGSVGElement> & { color?: string; emboss?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("h-6 w-6", className)}
         fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d={BADGE} style={{ fill: color }} />
      <path d="M34 50.5 L45 61.5 L67 37" fill="none" style={{ stroke: emboss }}
            strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
