import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Settings section in the Vercel pattern: title + description, content, and a
 * muted footer holding a hint on the left and the primary action on the right.
 */
export function SettingsCard({
  id,
  title,
  description,
  children,
  footer,
  footerHint,
  variant = "default",
  className,
}: {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  footerHint?: React.ReactNode
  variant?: "default" | "destructive"
  className?: string
}) {
  return (
    <Card id={id} className={cn("scroll-mt-24", variant === "destructive" && "border-destructive/30", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
      {(footer || footerHint) && (
        <CardFooter className={cn("justify-between", variant === "destructive" && "border-destructive/30 surface-destructive")}>
          <p className="text-sm text-muted-foreground">{footerHint}</p>
          <div className="flex items-center gap-2">{footer}</div>
        </CardFooter>
      )}
    </Card>
  )
}
