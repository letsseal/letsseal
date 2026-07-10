"use client";

import { scorePassword, STRENGTH_COLORS } from "@/lib/password";

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = scorePassword(password);
  const color = STRENGTH_COLORS[score];

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: i < score ? color : "var(--border, #e5e7eb)" }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs" style={{ color }}>{label}</p>
    </div>
  );
}
