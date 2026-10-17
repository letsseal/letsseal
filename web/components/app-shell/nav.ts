import { LayoutGrid, FileText, Award, Stamp, Fingerprint, Building2, Settings, ShieldCheck, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; exact?: boolean; external?: boolean };

export function buildNav(slug: string, opts: { enterprise?: boolean; identityEnabled?: boolean }) {
  const main: NavItem[] = [
    { label: "Overview", href: `/${slug}`, icon: LayoutGrid, exact: true },
    { label: "Documents", href: `/${slug}/documents`, icon: FileText },
    { label: "Credentials", href: `/${slug}/credentials`, icon: Award },
    { label: "Seal", href: `/${slug}/seal`, icon: Stamp },
    ...(opts.identityEnabled ? [{ label: "Identity seal", href: `/${slug}/identity`, icon: Fingerprint }] : []),
    ...(opts.enterprise ? [{ label: "Account", href: `/${slug}/account`, icon: Building2 }] : []),
  ];
  const secondary: NavItem[] = [
    { label: "Verify", href: "/verify", icon: ShieldCheck, external: true },
    { label: "Settings", href: `/${slug}/settings`, icon: Settings },
  ];
  return { main, secondary };
}

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
