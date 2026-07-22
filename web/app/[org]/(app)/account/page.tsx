import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Users, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { isTenantAdmin } from "@/lib/rbac";
import NewBusinessDialog from "@/components/NewBusinessDialog";
import { AccountPeople } from "@/components/AccountPeople";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const user = await requireUser();
  const org = await requireOrg(user.id, slug);
  if (!org?.tenant?.enterprise) redirect(`/${slug}`);

  const tenant = await db.tenant.findUnique({
    where: { id: org.tenant.id },
    include: {
      organizations: {
        orderBy: { name: "asc" },
        select: { id: true, slug: true, name: true, _count: { select: { memberships: true } } },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { email: true, name: true } } },
      },
      invitations: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, orgId: true, expiresAt: true, org: { select: { name: true } } },
      },
    },
  });
  if (!tenant) redirect(`/${slug}`);

  const myRole = tenant.memberships.find((m) => m.user.email === user.email)?.role ?? null;
  const canManage = isTenantAdmin(myRole);
  const members = tenant.memberships.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role }));
  const pendingInvites = tenant.invitations.map((i) => ({
    id: i.id, email: i.email, role: i.role, orgId: i.orgId, orgName: i.org?.name ?? null, expiresAt: i.expiresAt.toISOString(),
  }));
  const entities = tenant.organizations.map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" /> Account
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{tenant.name}</h1>
        {tenant.verifiedDomain ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified brand · {tenant.verifiedDomain}
          </div>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">Brand not yet verified · verify a domain in any entity&rsquo;s Settings.</div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Your brand and the legal entities under it. Each entity signs with its own
          certificate; they share this account and its verified identity.
        </p>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-muted-foreground" /> Entities
          <span className="text-xs font-normal text-muted-foreground">({tenant.organizations.length})</span>
          {canManage && (
            <div className="ml-auto">
              <NewBusinessDialog
                tenantId={tenant.id}
                triggerLabel="Add entity"
                title={`Add an entity to ${tenant.name}`}
                description="Another legal entity under this brand (e.g. a UK Ltd or a GmbH). It gets its own signing certificate but shares this account and its verified identity."
              />
            </div>
          )}
        </div>
        <div className="divide-y rounded-xl border bg-card">
          {tenant.organizations.map((o) => (
            <Link key={o.slug} href={`/${o.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{o.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {tenant.verifiedDomain ? (
                    <><ShieldCheck className="h-3 w-3 text-emerald-600" /> {tenant.verifiedDomain}</>
                  ) : (
                    <span>unverified</span>
                  )}
                  <span>· {o._count.memberships} member{o._count.memberships === 1 ? "" : "s"}</span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">/{o.slug}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" /> People
          <span className="text-xs font-normal text-muted-foreground">({members.length})</span>
        </div>
        <AccountPeople
          tenantId={tenant.id}
          members={members}
          initialInvites={pendingInvites}
          entities={entities}
          canManage={canManage}
        />
      </section>
    </div>
  );
}
