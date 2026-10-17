import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Label + control + optional hint or error. Keeps form spacing identical everywhere. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label?: React.ReactNode
  htmlFor?: string
  hint?: React.ReactNode
  error?: React.ReactNode
  optional?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {optional && <span className="font-normal text-muted-foreground">Optional</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
