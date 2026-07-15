import { NextRequest, NextResponse } from "next/server";
import { apiUser, requireOrg } from "@/lib/auth-helpers";
import { hostedSeal } from "@/lib/hosted";
import { orgSuspendedResponse } from "@/lib/org-guard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await requireOrg(userId, slug);
  if (!org) return NextResponse.json({ error: "not found" }, { status: 404 });
  const suspended = orgSuspendedResponse(org);
  if (suspended) return suspended;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "a 'file' field is required" }, { status: 400 });
  if (file.size > 25_000_000) return NextResponse.json({ error: "file too large (25MB max)" }, { status: 413 });

  const anchorParam = (form?.get("anchor") as string | null) ?? "true";
  const doAnchor = !/^(false|0|no)$/i.test(anchorParam);
  const stampParam = (form?.get("stamp") as string | null) ?? "true";
  const doStamp = !/^(false|0|no)$/i.test(stampParam);
  const title = (file.name || "document.pdf").slice(0, 200);

  try {
    const r = await hostedSeal(org, Buffer.from(await file.arrayBuffer()), { title, anchor: doAnchor, stamp: doStamp });
    return new Response(new Uint8Array(r.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${title.replace(/\.pdf$/i, "")}.sealed.pdf"`,
        "X-Letsseal-Sha256": r.sha256,
        "X-Letsseal-Cert-CN": r.certCN,
        "X-Letsseal-Anchor-State": r.anchorState,
        "X-Letsseal-Proof-Url": r.proofUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `seal failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
