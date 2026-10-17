import { cn } from "@/lib/utils";

/** A business's logo or initial on its brand colour. */
export function OrgAvatar({
  name, color, logoUrl, size = "sm", className,
}: { name: string; color: string; logoUrl?: string | null; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const s = { xs: "size-5 text-[10px] rounded", sm: "size-6 text-xs rounded-md", md: "size-8 text-sm rounded-md", lg: "size-12 text-lg rounded-lg" }[size];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden font-semibold text-white", s, className)}
      style={{ background: color }}
    >
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : name[0]?.toUpperCase()}
    </span>
  );
}
