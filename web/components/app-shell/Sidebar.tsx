"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronsUpDown } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import UserMenu from "@/components/UserMenu";
import { OrgAvatar } from "./OrgAvatar";
import { buildNav, isActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

export function Sidebar({
  slug, orgName, brandColor, docCount, enterprise = false, accountName, identityEnabled = true, userName, userEmail,
}: {
  slug: string; orgName: string; brandColor: string; docCount: number;
  enterprise?: boolean; accountName?: string; identityEnabled?: boolean;
  userName?: string | null; userEmail: string;
}) {
  const pathname = usePathname();
  const { main, secondary } = buildNav(slug, { enterprise, identityEnabled });

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center px-4">
        <Wordmark href="/app" size="sm" />
      </div>

      <div className="px-3">
        <Link
          href="/app"
          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 shadow-xs transition-colors hover:bg-accent"
        >
          <OrgAvatar name={orgName} color={brandColor} size="xs" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{orgName}</span>
            {enterprise && accountName && <span className="block truncate text-xs text-muted-foreground">{accountName}</span>}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pt-4">
        {main.map((n) => (
          <NavLink key={n.href} item={n} active={isActive(pathname, n)} badge={n.label === "Documents" && docCount ? docCount : undefined} />
        ))}
      </nav>

      <div className="space-y-0.5 border-t px-3 py-3">
        {secondary.map((n) => (
          <NavLink key={n.href} item={n} active={isActive(pathname, n)} />
        ))}
        <div className="pt-2">
          <UserMenu name={userName} email={userEmail} variant="row" />
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      target={item.external ? "_blank" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
        active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge != null && <span className="text-xs tabular-nums text-muted-foreground">{badge}</span>}
      {item.external && <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
    </Link>
  );
}
