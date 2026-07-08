import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import EnvelopeShare from "@/components/EnvelopeShare";

export const dynamic = "force-dynamic";

export default async function EnvelopePage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  const envelope = await db.envelope.findUnique({
    where: { id },
    include: { org: true, signers: { orderBy: { order: "asc" } } },
  });
  if (!envelope || envelope.org.slug !== slug) notFound();

  return (
    <EnvelopeShare
      slug={slug}
      envelope={{ id: envelope.id, title: envelope.title, status: envelope.status, completed: envelope.status === "completed" }}
      org={{ name: envelope.org.name, brandColor: envelope.org.brandColor }}
      signers={envelope.signers.map((s) => ({
        name: s.name, email: s.email, kind: s.kind, token: s.token, status: s.status, accessCode: s.accessCode,
      }))}
    />
  );
}
