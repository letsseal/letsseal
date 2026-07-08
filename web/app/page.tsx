import Link from "next/link";
import { ShieldCheck, ArrowRight, FileSignature } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const orgs = await db.organization.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { envelopes: true } } },
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-lg bg-neutral-900 flex items-center justify-center">
          <FileSignature className="h-5 w-5 text-white" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">docsigner</h1>
      </div>
      <p className="text-neutral-500 mt-3 max-w-lg">
        Multi-business document signing with your own cryptographic seal — remote, in-person, and no-email signers.
      </p>

      <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mt-12 mb-3">Businesses</h2>
      <div className="grid gap-3">
        {orgs.map((o) => (
          <Link key={o.id} href={`/${o.slug}`}
                className="group flex items-center justify-between rounded-xl border bg-white p-4 hover:shadow-sm hover:border-neutral-300 transition">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
                    style={{ background: o.brandColor }}>{o.name[0]}</span>
              <div>
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-neutral-500">{o._count.envelopes} envelope{o._count.envelopes === 1 ? "" : "s"}</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-0.5 transition" />
          </Link>
        ))}
      </div>

      <div className="mt-12 pt-6 border-t">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/verify"><ShieldCheck className="h-4 w-4" /> Public verification portal</Link>
        </Button>
      </div>
    </main>
  );
}
