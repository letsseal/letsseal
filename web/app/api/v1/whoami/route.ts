import { NextRequest, NextResponse } from "next/server";
import { authApiKey } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await authApiKey(req);
  if (!auth.ok) return auth.res;
  const { org, scopes } = auth.ctx;
  return NextResponse.json({ org: { slug: org.slug, name: org.name }, scopes });
}
