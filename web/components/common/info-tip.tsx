"use client"

import { Info } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Secondary layer for an explanation that some users need and most don't.
 * Opens on click/tap/keyboard, so it works on touch, unlike a hover tooltip.
 */
export function InfoTip({
  children,
  label = "More information",
  className,
}: {
  children: React.ReactNode
  label?: string
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
          className
        )}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="space-y-1.5 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </PopoverContent>
    </Popover>
  )
}
