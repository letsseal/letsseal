import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { authApiKey } from "@/lib/api-auth";
import { hostedSealBlob } from "@/lib/hosted";
import { overContentLength, tooLarge } from "@/lib/limits";

export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "seal");
  if (!auth.ok) return auth.res;

  const ctype = req.headers.get("content-type") || "";
  let sha256: string | null = null;
  let title: string | null = null;
  let anchorRaw: string | null = req.nextUrl.searchParams.get("anchor");

  if (ctype.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }
    if (body.sha256 != null) sha256 = String(body.sha256);
    if (body.title != null) title = String(body.title).slice(0, 200);
    if (anchorRaw == null && body.anchor != null) anchorRaw = String(body.anchor);
  } else {
    if (overContentLength(req)) return NextResponse.json({ error: "file too large" }, { status: 413 });
    const form = await req.formData().catch(() => null);
    if (form?.get("sha256")) {
      sha256 = String(form.get("sha256"));
    } else {
      const file = form?.get("file");
      if (file instanceof File) {
        if (tooLarge(file)) return NextResponse.json({ error: "file too large" }, { status: 413 });
        sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
        title = file.name || null;
      }
    }
    if (form?.get("title")) title = String(form.get("title")).slice(0, 200);
    if (anchorRaw == null && form?.get("anchor") != null) anchorRaw = String(form.get("anchor"));
  }

  sha256 = sha256?.trim().toLowerCase() ?? null;
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) {
    return NextResponse.json(
      { error: "provide a 'sha256' (64 hex) to sign digest-only, or a 'file' to hash server-side" },
      { status: 400 },
    );
  }
  const doAnchor = anchorRaw == null ? true : !/^(false|0|no)$/i.test(anchorRaw);

  try {
    const r = await hostedSealBlob(auth.ctx.org, sha256, { title, anchor: doAnchor });
    return NextResponse.json(
      {
        sha256: r.sha256, sig: r.sig, certPem: r.certPem, chainPem: r.chainPem,
        certCN: r.certCN, identity: r.identity, anchorState: r.anchorState,
        proofUrl: r.proofUrl, proofCode: r.proofCode, bundle: r.bundle,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: `blob seal failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
