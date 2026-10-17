"use client";

import { scorePassword } from "@/lib/password";
import { cn } from "@/lib/utils";

const BAR = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"] as const;
const TEXT = ["text-destructive", "text-destructive", "text-warning", "text-success", "text-success"] as const;

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = scorePassword(password);

  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < score ? BAR[score] : "bg-border")} />
        ))}
      </div>
      <p className={cn("text-xs", TEXT[score])}>{label}</p>
    </div>
  );
}
