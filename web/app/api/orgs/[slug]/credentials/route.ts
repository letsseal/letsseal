import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/auth-helpers";
import { checkOrgRole } from "@/lib/rbac";
import { issueCredential, type IssueInput } from "@/lib/credentials";
import { orgSuspendedResponse } from "@/lib/org-guard";

const MAX_BATCH = 200;

function parseOne(raw: any): IssueInput | { error: string } {
  const recipientName = String(raw?.recipientName ?? "").trim();
  const title = String(raw?.title ?? "").trim();
  if (!recipientName) return { error: "recipientName required" };
  if (!title) return { error: "title required" };
  const date = (v: any): Date | null => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  };
  return {
    recipientName: recipientName.slice(0, 120),
    recipientEmail: raw?.recipientEmail ? String(raw.recipientEmail).trim().slice(0, 200) : null,
    credType: raw?.credType ? String(raw.credType).trim().slice(0, 80) : "Certificate",
    title: title.slice(0, 160),
    description: raw?.description ? String(raw.description).slice(0, 400) : null,
    credentialCode: raw?.credentialCode ? String(raw.credentialCode).trim().slice(0, 80) : null,
    issuedOn: date(raw?.issuedOn) ?? undefined,
    expiresOn: date(raw?.expiresOn),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await apiUser();
  const chk = await checkOrgRole(userId, slug, "signer");
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const org = chk.access.org;
  const suspended = orgSuspendedResponse(org);
  if (suspended) return suspended;

  const body = await req.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body?.credentials) ? body.credentials : [body];
  if (rows.length === 0) return NextResponse.json({ error: "no credentials" }, { status: 400 });
  if (rows.length > MAX_BATCH) return NextResponse.json({ error: `max ${MAX_BATCH} per batch` }, { status: 400 });

  const results = [];
  for (const raw of rows) {
    const parsed = parseOne(raw);
    if ("error" in parsed) { results.push({ ok: false, error: parsed.error, recipientName: raw?.recipientName ?? null }); continue; }
    try {
      const issued = await issueCredential(org, parsed);
      results.push({ ok: true, recipientName: parsed.recipientName, ...issued });
    } catch (e) {
      results.push({ ok: false, error: e instanceof Error ? e.message : String(e), recipientName: parsed.recipientName });
    }
  }
  const issued = results.filter((r) => r.ok).length;
  return NextResponse.json({ issued, total: rows.length, results }, { status: issued > 0 ? 201 : 400 });
}
