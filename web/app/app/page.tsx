import Link from "next/link";
import { ArrowRight, ShieldCheck, Building2, FileText } from "lucide-react";
import { requireUser, getUserOrgs } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";
import UserMenu from "@/components/UserMenu";
import NewBusinessDialog from "@/components/NewBusinessDialog";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const user = await requireUser();
  const orgs = await getUserOrgs(user.id);

  return (
    <div className="min-h-screen">
      <TopBar right={<UserMenu name={user.name} email={user.email} />} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your businesses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each business has its own branding and cryptographic signing certificate.
            </p>
          </div>
          <NewBusinessDialog />
        </div>

        {orgs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed bg-card p-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No businesses yet. Create one to get its own branding and signing certificate.
            </p>
            <div className="mt-5 flex justify-center"><NewBusinessDialog /></div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((o) => (
              <Link key={o.id} href={`/${o.slug}`}
                    className="group relative flex flex-col justify-between rounded-2xl border bg-card p-5 transition hover:border-foreground/20 hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-lg font-semibold text-white"
                        style={{ background: o.brandColor }}>
                    {o.logoUrl ? <img src={o.logoUrl} alt="" className="h-full w-full object-cover" /> : o.name[0]}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
                <div className="mt-6">
                  <div className="font-medium leading-tight">{o.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {o._count.envelopes} envelope{o._count.envelopes === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 border-t pt-6">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/verify"><ShieldCheck className="h-4 w-4" /> Public verification portal</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
