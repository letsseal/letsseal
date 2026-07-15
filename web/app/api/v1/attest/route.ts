import { NextRequest, NextResponse } from "next/server";
import { authApiKey } from "@/lib/api-auth";
import { hostedSealAttestation } from "@/lib/hosted";

//   • predicate     — the claim object: an SBOM (SPDX/CycloneDX), SLSA provenance,
//   • predicateType — spdxjson | cyclonedx | slsaprovenance | vuln | custom, or a
export async function POST(req: NextRequest) {
  const auth = await authApiKey(req, "seal");
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const sha256 = String(body.sha256 ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    return NextResponse.json({ error: "provide a 'sha256' (64 hex) — the artifact digest the attestation is about" }, { status: 400 });
  }
  if (body.predicate == null || typeof body.predicate !== "object") {
    return NextResponse.json({ error: "provide a 'predicate' (JSON object): an SBOM, SLSA provenance, etc." }, { status: 400 });
  }
  const predicateType = body.predicateType != null ? String(body.predicateType).slice(0, 200) : "custom";
  const subjectName = body.subjectName != null ? String(body.subjectName).slice(0, 200) : undefined;
  const title = body.title != null ? String(body.title).slice(0, 200) : null;
  const doAnchor = body.anchor == null ? true : !/^(false|0|no)$/i.test(String(body.anchor));

  try {
    const r = await hostedSealAttestation(auth.ctx.org, sha256, body.predicate, {
      predicateType, subjectName, title, anchor: doAnchor,
    });
    return NextResponse.json(
      {
        sha256: r.sha256, bundle: r.bundle, pubkey: r.pubkey, predicateType: r.predicateType,
        certCN: r.certCN, anchorState: r.anchorState, proofUrl: r.proofUrl, proofCode: r.proofCode,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: `attest failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
