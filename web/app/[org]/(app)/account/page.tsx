import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, requireOrg } from "@/lib/auth-helpers";
import { isTenantAdmin } from "@/lib/rbac";
import NewBusinessDialog from "@/components/NewBusinessDialog";
import { AccountPeople } from "@/components/AccountPeople";
import { OrgAvatar } from "@/components/app-shell/OrgAvatar";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
        select: { id: true, slug: true, name: true, brandColor: true, logoUrl: true, _count: { select: { memberships: true } } },
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
    <div className="max-w-3xl">
      <PageHeader
        title={tenant.name}
        description={
          tenant.verifiedDomain ? (
            <span className="flex items-center gap-2">
              <StatusBadge tone="success">Verified</StatusBadge>
              <span className="font-mono text-xs">{tenant.verifiedDomain}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <StatusBadge tone="neutral">Not verified</StatusBadge>
              <Link href={`/${slug}/settings#issuer-identity`} className="underline underline-offset-4 hover:text-foreground">Verify a domain</Link>
            </span>
          )
        }
      />

      <div className="grid gap-8">
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Entities <Badge variant="secondary">{tenant.organizations.length}</Badge>
            </h2>
            {canManage && (
              <NewBusinessDialog
                tenantId={tenant.id}
                triggerLabel="Add entity"
                triggerVariant="outline"
                triggerSize="sm"
                title={`Add an entity to ${tenant.name}`}
                description="Another legal entity under this brand, e.g. a UK Ltd or a GmbH."
              />
            )}
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.organizations.map((o) => (
                  <TableRow key={o.slug} className="relative">
                    <TableCell className="w-full max-w-0">
                      <div className="flex items-center gap-3">
                        <OrgAvatar name={o.name} color={o.brandColor} logoUrl={o.logoUrl} />
                        <Link href={`/${o.slug}`} className="truncate font-medium after:absolute after:inset-0">{o.name}</Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{o._count.memberships}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            People <Badge variant="secondary">{members.length}</Badge>
          </h2>
          <AccountPeople
            tenantId={tenant.id}
            members={members}
            initialInvites={pendingInvites}
            entities={entities}
            canManage={canManage}
          />
        </section>
      </div>
    </div>
  );
}
