import { NextRequest, NextResponse } from "next/server";
import { authApiKey } from "@/lib/api-auth";
import { hostedSealC2pa } from "@/lib/hosted";
import { overContentLength, tooLarge } from "@/lib/limits";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/tiff": "tiff",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
};

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "seal");
  if (!auth.ok) return auth.res;

  if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "multipart form with an image 'file' field required" }, { status: 400 });
  }
  if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
  const image = Buffer.from(await file.arrayBuffer());
  const title = form?.get("title") ? String(form.get("title")).slice(0, 200) : (file.name || null);

  const anchorParam = req.nextUrl.searchParams.get("anchor") ?? (form?.get("anchor") as string | null);
  const doAnchor = anchorParam == null ? true : !/^(false|0|no)$/i.test(anchorParam);

  try {
    const r = await hostedSealC2pa(auth.ctx.org, image, {
      filename: file.name, contentType: file.type, title, anchor: doAnchor,
    });
    const ext = EXT[r.format] ?? "img";
    return new Response(new Uint8Array(r.image), {
      headers: {
        "Content-Type": r.format || "application/octet-stream",
        "Content-Disposition": `attachment; filename="sealed.${ext}"`,
        "X-Letsseal-Sha256": r.sha256,
        "X-Letsseal-Cert-CN": r.certCN,
        "X-Letsseal-Format": r.format,
        "X-Letsseal-Anchor-State": r.anchorState,
        "X-Letsseal-Proof-Url": r.proofUrl,
        "X-Letsseal-Proof-Code": r.proofCode ?? "",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `c2pa seal failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
