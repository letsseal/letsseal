"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Award, Stamp, BadgeCheck, Fingerprint, Code2, Settings, ChevronsUpDown, Building2 } from "lucide-react";
import { SealMark } from "@/components/brand/SealMark";

export function Sidebar({
  slug, orgName, brandColor, docCount, enterprise = false, accountName,
}: {
  slug: string; orgName: string; brandColor: string; docCount: number;
  enterprise?: boolean; accountName?: string;
}) {
  const pathname = usePathname();
  const nav = [
    { label: "Dashboard", href: `/${slug}`, icon: LayoutDashboard, exact: true },
    { label: "Documents", href: `/${slug}/documents`, icon: FileText, badge: docCount || undefined },
    { label: "Credentials", href: `/${slug}/credentials`, icon: Award },
    { label: "Seal & anchor", href: `/${slug}/seal`, icon: Stamp },
    { label: "Identity seal", href: `/${slug}/identity`, icon: Fingerprint },
    { label: "Verify", href: `/verify`, icon: BadgeCheck },
    ...(enterprise ? [{ label: "Account", href: `/${slug}/account`, icon: Building2 }] : []),
  ];
  const dev = [
    { label: "API keys", href: `/${slug}/settings#api-keys`, icon: Code2 },
    { label: "Settings", href: `/${slug}/settings`, icon: Settings },
  ];
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="hidden flex-col border-r bg-secondary/50 md:flex">
      <div className="flex h-[68px] items-center gap-0.5 px-5">
        <SealMark className="h-[1em] w-[1em]" />
        <span className="text-[17px] font-bold tracking-[-0.05em]">LetsSeal</span>
      </div>

      <nav className="flex-1 px-3 py-2">
        {nav.map((n) => {
          const Icon = n.icon;
          const on = active(n.href, n.exact);
          return (
            <Link
              key={n.label}
              href={n.href}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              {n.badge != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${on ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {n.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Developers
        </div>
        {dev.map((n) => {
          const Icon = n.icon;
          const on = active(n.href);
          return (
            <Link
              key={n.label}
              href={n.href}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3">
        <Link
          href="/app"
          className="flex items-center gap-2.5 rounded-xl border bg-card p-2.5 transition-colors hover:bg-secondary"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: brandColor }}>
            {orgName[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">{orgName}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {enterprise && accountName ? `${accountName} · switch` : "Switch account"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>
    </aside>
  );
}
