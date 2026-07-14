import { NextRequest, NextResponse } from "next/server";
import { authApiKey } from "@/lib/api-auth";
import { hostedSealSmime } from "@/lib/hosted";
import { overContentLength, tooLarge } from "@/lib/limits";

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "seal");
  if (!auth.ok) return auth.res;

  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "multipart form with a message 'file' field required" }, { status: 400 });
  }
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const message = Buffer.from(await file.arrayBuffer());
  const title = form?.get("title") ? String(form.get("title")).slice(0, 200) : (file.name || null);

  const anchorParam = req.nextUrl.searchParams.get("anchor") ?? (form?.get("anchor") as string | null);
  const doAnchor = anchorParam == null ? true : !/^(false|0|no)$/i.test(anchorParam);

  try {
    const r = await hostedSealSmime(auth.ctx.org, message, { filename: file.name, title, anchor: doAnchor });
    return new Response(new Uint8Array(r.eml), {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": 'attachment; filename="sealed.eml"',
        "X-Letsseal-Sha256": r.sha256,
        "X-Letsseal-Cert-CN": r.certCN,
        "X-Letsseal-Anchor-State": r.anchorState,
        "X-Letsseal-Proof-Url": r.proofUrl,
        "X-Letsseal-Proof-Code": r.proofCode ?? "",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `smime seal failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
