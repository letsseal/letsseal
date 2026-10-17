"use client";

import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function UserMenu({
  name, email, variant = "avatar",
}: { name?: string | null; email: string; variant?: "avatar" | "row" }) {
  const { theme, setTheme } = useTheme();
  const initial = (name || email)[0]?.toUpperCase() ?? "?";
  const avatar = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-secondary text-xs font-medium">
      {initial}
    </span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          variant === "row"
            ? "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent"
            : "rounded-full",
        )}
        aria-label="Account menu"
      >
        {avatar}
        {variant === "row" && <span className="min-w-0 flex-1 truncate">{name || email}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "row" ? "start" : "end"} side={variant === "row" ? "top" : "bottom"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          {name && <div className="truncate text-sm font-medium text-foreground">{name}</div>}
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/signin" })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
