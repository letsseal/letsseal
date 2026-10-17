"use client"

import { useRef, useState } from "react"
import { Loader2, Upload } from "lucide-react"

import { cn } from "@/lib/utils"

/** The one file drop target used across the app. */
export function Dropzone({
  onFiles,
  accept,
  multiple,
  disabled,
  busy,
  title = "Drop a file, or click to choose",
  busyTitle = "Uploading…",
  hint,
  size = "default",
  className,
}: {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  busy?: boolean
  title?: React.ReactNode
  busyTitle?: React.ReactNode
  hint?: React.ReactNode
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const inactive = disabled || busy
  return (
    <button
      type="button"
      disabled={inactive}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!inactive) setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (inactive) return
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background text-center transition-colors outline-none hover:border-foreground/30 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-background",
        size === "sm" && "px-4 py-5",
        size === "default" && "px-6 py-10",
        size === "lg" && "px-6 py-16",
        over && "border-foreground/40 bg-muted",
        className
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      </span>
      <span className="text-sm font-medium">{busy ? busyTitle : title}</span>
      {hint && !busy && <span className="text-sm text-muted-foreground">{hint}</span>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = ""
        }}
      />
    </button>
  )
}
