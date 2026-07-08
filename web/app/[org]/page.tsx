import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, ShieldCheck, FileText, Download, Users, Contact } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-neutral-100 text-neutral-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  voided: { label: "Voided", className: "bg-red-100 text-red-700" },
};

export default async function Dashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = await db.organization.findUnique({
    where: { slug },
    include: { envelopes: { orderBy: { createdAt: "desc" }, include: { signers: true, sealed: true } } },
  });
  if (!org) notFound();

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link href="/"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
                style={{ background: org.brandColor }}>{org.name[0]}</span>
          <div>
            <h1 className="text-xl font-semibold">{org.name}</h1>
            <p className="text-xs text-neutral-500">{org.envelopes.length} envelopes</p>
          </div>
        </div>
        <Button asChild className="gap-2 text-white" style={{ background: org.brandColor }}>
          <Link href={`/${slug}/new`}><Plus className="h-4 w-4" /> New envelope</Link>
        </Button>
      </div>

      <div className="mt-8 rounded-xl border bg-white divide-y overflow-hidden">
        {org.envelopes.length === 0 && (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-neutral-300" />
            <p className="mt-3 text-sm text-neutral-500">No envelopes yet. Create one to upload a PDF and place fields.</p>
          </div>
        )}
        {org.envelopes.map((e) => {
          const signed = e.signers.filter((s) => s.status === "signed").length;
          const st = STATUS[e.status] ?? STATUS.draft;
          return (
            <div key={e.id} className="flex items-center justify-between p-4 hover:bg-neutral-50/50 transition">
              <div className="min-w-0">
                <div className="font-medium truncate">{e.title}</div>
                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{signed}/{e.signers.length} signed</span>
                  {e.sealed && (
                    <span className="flex items-center gap-1 text-green-600">
                      <ShieldCheck className="h-3 w-3" />sealed {e.sealed.sha256.slice(0, 10)}…
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className={`font-normal ${st.className}`}>{st.label}</Badge>
                {e.status === "draft" ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/${slug}/new?envelope=${e.id}`}>Edit</Link>
                  </Button>
                ) : e.status === "completed" ? (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={`/${slug}/e/${e.id}`}><Download className="h-3.5 w-3.5" /> Manage</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline" className="gap-1.5" style={{ borderColor: org.brandColor, color: org.brandColor }}>
                    <Link href={`/${slug}/e/${e.id}`}><Contact className="h-3.5 w-3.5" /> Sign / share</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
