import { cn } from "@/lib/utils";

const BADGE =
  "M 50.00 9.00 A 10.61 10.61 0 0 1 70.50 14.49 A 10.61 10.61 0 0 1 85.51 29.50 A 10.61 10.61 0 0 1 91.00 50.00 A 10.61 10.61 0 0 1 85.51 70.50 A 10.61 10.61 0 0 1 70.50 85.51 A 10.61 10.61 0 0 1 50.00 91.00 A 10.61 10.61 0 0 1 29.50 85.51 A 10.61 10.61 0 0 1 14.49 70.50 A 10.61 10.61 0 0 1 9.00 50.00 A 10.61 10.61 0 0 1 14.49 29.50 A 10.61 10.61 0 0 1 29.50 14.49 A 10.61 10.61 0 0 1 50.00 9.00 Z";

const SEAL =
  "M22 34 C20 27 27 22 33 25 C38 27 39 33 39 38 C46 47 55 52 64 51 C72 50 79 43 82 34 C84 28 90 30 89 36 C88 42 86 47 82 51 C88 52 90 58 84 60 C74 66 60 66 50 63 C40 66 30 64 26 57 C21 52 20 44 22 38 C22 37 22 35 22 34 Z";

export function SealMark({
  className,
  color = "var(--brand)",
  emboss = "#ffffff",
  seal = true,
  ...props
}: React.SVGProps<SVGSVGElement> & { color?: string; emboss?: string; seal?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("h-6 w-6", className)}
         fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d={BADGE} style={{ fill: color }} />
      {seal && (
        <g transform="translate(50 50) scale(0.84) translate(-54.5 -48)" opacity="0.13">
          <path d={SEAL} style={{ fill: emboss }} />
        </g>
      )}
      <path d="M34 50.5 L45 61.5 L67 37" fill="none" style={{ stroke: emboss }}
            strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
