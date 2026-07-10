import { NextRequest, NextResponse } from "next/server";
import { authApiKey } from "@/lib/api-auth";
import { hostedSeal } from "@/lib/hosted";
import { overContentLength, tooLarge } from "@/lib/limits";

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "seal");
  if (!auth.ok) return auth.res;

  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "multipart form with a 'file' field required" }, { status: 400 });
  }
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const pdf = Buffer.from(await file.arrayBuffer());
  const title = form?.get("title") ? String(form.get("title")).slice(0, 200) : (file.name || null);
  const reason = form?.get("reason") ? String(form.get("reason")).slice(0, 200) : undefined;

  const anchorParam = req.nextUrl.searchParams.get("anchor") ?? (form?.get("anchor") as string | null);
  const doAnchor = anchorParam == null ? true : !/^(false|0|no)$/i.test(anchorParam);

  try {
    const r = await hostedSeal(auth.ctx.org, pdf, { title, reason, anchor: doAnchor });
    return new Response(new Uint8Array(r.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sealed.pdf"',
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
