import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warning" | "info" | "destructive" | "neutral"

/** A status pill with a leading dot. Use for record state (Sealed, Awaiting, Revoked…). */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant={tone === "neutral" ? "secondary" : tone} className={cn("gap-1.5", className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </Badge>
  )
}
