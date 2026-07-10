"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ls-theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function set(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ls-theme", next ? "dark" : "light");
  }

  return (
    <div className="inline-flex items-center rounded-lg border bg-card p-0.5 text-[13px] font-medium">
      <button
        onClick={() => set(false)}
        className={`rounded-md px-2.5 py-1 transition-colors ${!dark ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        Light
      </button>
      <button
        onClick={() => set(true)}
        className={`rounded-md px-2.5 py-1 transition-colors ${dark ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        Dark
      </button>
    </div>
  );
}
