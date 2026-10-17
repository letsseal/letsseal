"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/brand/Wordmark";
import UserMenu from "@/components/UserMenu";
import { buildNav, isActive } from "./nav";
import { cn } from "@/lib/utils";

/** Top bar for small screens, where the sidebar is hidden. */
export function AppHeader({
  slug, userName, userEmail, enterprise = false, identityEnabled = true,
}: { slug: string; userName?: string | null; userEmail: string; enterprise?: boolean; identityEnabled?: boolean }) {
  const pathname = usePathname();
  const { main, secondary } = buildNav(slug, { enterprise, identityEnabled });

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Menu"><Menu /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {main.map((n) => (
            <DropdownMenuItem key={n.href} asChild className={cn(isActive(pathname, n) && "font-medium")}>
              <Link href={n.href}><n.icon /> {n.label}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {secondary.map((n) => (
            <DropdownMenuItem key={n.href} asChild>
              <Link href={n.href}><n.icon /> {n.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Wordmark href="/app" size="sm" />
      <div className="ml-auto">
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
