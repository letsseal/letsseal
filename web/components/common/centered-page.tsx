import { Wordmark } from "@/components/brand/Wordmark"
import { cn } from "@/lib/utils"

/** Public single-purpose pages (auth, email and domain confirmation): logo, optional icon, title, one line, content. */
export function CenteredPage({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
  className,
}: {
  icon?: React.ElementType
  iconClassName?: string
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center px-6 py-16">
      <div className={cn("w-full max-w-sm", className)}>
        <div className="mb-10 flex justify-center">
          <Wordmark href="/" size="md" />
        </div>
        {(Icon || title || description) && (
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            {Icon && (
              <span className="mb-4 flex size-10 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs">
                <Icon className={cn("size-5", iconClassName)} />
              </span>
            )}
            {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        {children}
      </div>
    </main>
  )
}
