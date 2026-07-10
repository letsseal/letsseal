"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Plus, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserMenu from "@/components/UserMenu";
import { ThemeToggle } from "./ThemeToggle";

const TITLES: Record<string, string> = {
  documents: "Documents",
  credentials: "Credentials",
  seal: "Seal & anchor",
  settings: "Settings",
};

export function AppHeader({ slug, userName, userEmail }: { slug: string; userName?: string | null; userEmail: string }) {
  const pathname = usePathname();
  const seg = pathname.split("/")[2];
  const title = TITLES[seg] ?? "Dashboard";

  return (
    <header className="flex h-[68px] items-center gap-4 border-b px-8">
      <h1 className="text-[15px] font-semibold">{title}</h1>

      <div className="relative mx-2 hidden max-w-md flex-1 lg:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search documents, credentials…"
          className="h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/verify"><BadgeCheck className="h-4 w-4" /> <span className="hidden sm:inline">Verify a document</span></Link>
        </Button>
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/${slug}/new`}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New document</span></Link>
        </Button>
        <ThemeToggle />
        <UserMenu name={userName} email={userEmail} />
      </div>
    </header>
  );
}
