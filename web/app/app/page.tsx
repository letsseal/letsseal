import Link from "next/link";
import { Building2, ChevronRight, ShieldCheck } from "lucide-react";
import { requireUser, getUserOrgs } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import UserMenu from "@/components/UserMenu";
import NewBusinessDialog from "@/components/NewBusinessDialog";
import { OrgAvatar } from "@/components/app-shell/OrgAvatar";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const user = await requireUser();
  const orgs = await getUserOrgs(user.id);

  type Org = (typeof orgs)[number];
  const byTenant = new Map<string, { name: string; orgs: Org[] }>();
  for (const o of orgs) {
    const key = o.tenant?.id ?? o.id;
    const g = byTenant.get(key) ?? { name: o.tenant?.name ?? o.name, orgs: [] };
    g.orgs.push(o);
    byTenant.set(key, g);
  }
  const groups = [...byTenant.entries()];
  const brands = groups.filter(([, g]) => g.orgs.length > 1);
  const singles = groups.filter(([, g]) => g.orgs.length === 1).flatMap(([, g]) => g.orgs);

  const grid = (list: Org[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((o) => (
        <Link
          key={o.id}
          href={`/${o.slug}`}
          className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <OrgAvatar name={o.name} color={o.brandColor} logoUrl={o.logoUrl} size="md" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.name}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <TopBar
        right={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/verify"><ShieldCheck /> Verify</Link>
            </Button>
            <UserMenu name={user.name} email={user.email} />
          </div>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader title="Businesses" actions={orgs.length > 0 && <NewBusinessDialog />} />

        {orgs.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No businesses yet"
            description="Create one to start sealing and sending documents."
            action={<NewBusinessDialog />}
          />
        ) : (
          <div className="grid gap-8">
            {brands.map(([key, b]) => (
              <section key={key} className="grid gap-3">
                <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
                  {b.name}
                  <span className="text-sm font-normal text-muted-foreground">{b.orgs.length} entities</span>
                </h2>
                {grid(b.orgs)}
              </section>
            ))}
            {singles.length > 0 && grid(singles)}
          </div>
        )}
      </main>
    </div>
  );
}
