"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Copies `value`. Icon-only by default; pass `label` for a text button. */
export function CopyButton({
  value,
  label,
  ariaLabel,
  toastMessage,
  variant = "outline",
  size,
  className,
}: {
  value: string
  label?: string
  ariaLabel?: string
  toastMessage?: string
  variant?: "outline" | "ghost" | "secondary"
  size?: "sm" | "icon" | "icon-sm" | "icon-xs" | "xs"
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? Check : Copy
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (label ? "sm" : "icon-sm")}
      className={className}
      aria-label={label ? undefined : ariaLabel ?? "Copy"}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
        if (toastMessage) toast.success(toastMessage)
      }}
    >
      <Icon />
      {label && (copied ? "Copied" : label)}
    </Button>
  )
}
