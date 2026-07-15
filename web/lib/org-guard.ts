import { NextResponse } from "next/server";

export function orgSuspendedResponse(org: { status?: string | null }): NextResponse | null {
  if (org.status === "suspended") {
    return NextResponse.json(
      { error: "this organisation is suspended and cannot seal new documents" },
      { status: 403 },
    );
  }
  return null;
}

export function isSuspended(org: { status?: string | null }): boolean {
  return org.status === "suspended";
}
