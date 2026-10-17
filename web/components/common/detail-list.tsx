import { cn } from "@/lib/utils"

/** Label/value rows, e.g. proof details. */
export function DetailList({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("divide-y text-sm", className)} {...props} />
}

export function DetailRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-2.5", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  )
}
