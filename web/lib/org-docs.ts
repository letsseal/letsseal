
export type DocTone = "green" | "amber" | "gray" | "red";

export type DocRow = {
  id: string;
  kind: "contract" | "seal" | "credential";
  title: string;
  meta: string;
  status: { label: string; tone: DocTone };
  signers: { initials: string }[];
  signedText?: string;
  anchor: { state: string; block: number | null } | null;
  date: Date;
  href: string;
};

export type EnvelopeForRow = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  sealingStartedAt?: Date | null;
  signers: { name: string; status: string }[];
  sealed: { anchorState: string; btcBlock: number | null } | null;
};

export type SealedDocForRow = {
  id: string;
  title: string | null;
  sha256: string;
  sealedAt: Date;
  anchorState: string;
  btcBlock: number | null;
};

export type CredentialForRow = {
  id: string;
  title: string;
  recipientName: string;
  sha256: string | null;
  issuedOn: Date;
  revokedAt: Date | null;
};

export type OrgForRows = {
  slug: string;
  envelopes?: EnvelopeForRow[];
  sealedDocuments?: SealedDocForRow[];
  credentials?: CredentialForRow[];
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function envelopeBadge(e: { status: string; sealingStartedAt?: Date | null }): { label: string; tone: DocTone } {
  switch (e.status) {
    case "completed": return { label: "Sealed", tone: "green" };
    case "voided":    return { label: "Voided", tone: "red" };
    case "sent":
      return e.sealingStartedAt
        ? { label: "Sealing", tone: "amber" }
        : { label: "Awaiting", tone: "amber" };
    default:          return { label: "Draft", tone: "gray" };
  }
}

export function buildDocRows(org: OrgForRows): DocRow[] {
  const rows: DocRow[] = [];

  for (const e of org.envelopes ?? []) {
    const signed = e.signers.filter((s) => s.status === "signed").length;
    rows.push({
      id: e.id,
      kind: "contract",
      title: e.title,
      meta: `Contract · ${e.signers.length} signer${e.signers.length === 1 ? "" : "s"}`,
      status: envelopeBadge(e),
      signers: e.signers.map((s) => ({ initials: initials(s.name) })),
      signedText: `${signed}/${e.signers.length} signed`,
      anchor: e.sealed ? { state: e.sealed.anchorState, block: e.sealed.btcBlock } : null,
      date: e.completedAt ?? e.createdAt,
      href: `/${org.slug}/e/${e.id}`,
    });
  }

  for (const d of org.sealedDocuments ?? []) {
    rows.push({
      id: d.id,
      kind: "seal",
      title: d.title ?? "Sealed document",
      meta: "Sealed doc",
      status: { label: "Sealed", tone: "green" },
      signers: [],
      anchor: { state: d.anchorState, block: d.btcBlock },
      date: d.sealedAt,
      href: `/d/${d.sha256}`,
    });
  }

  for (const c of org.credentials ?? []) {
    if (!c.sha256) continue;
    rows.push({
      id: c.id,
      kind: "credential",
      title: c.title,
      meta: `Credential · ${c.recipientName}`,
      status: { label: c.revokedAt ? "Withdrawn" : "Sealed", tone: c.revokedAt ? "gray" : "green" },
      signers: [],
      anchor: null,
      date: c.issuedOn,
      href: `/d/${c.sha256}`,
    });
  }

  return rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export function relativeDate(d: Date, now = new Date()): string {
  const days = Math.floor((+new Date(now.toDateString()) - +new Date(new Date(d).toDateString())) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function withinWeek(d: Date | null | undefined, now = new Date()): boolean {
  if (!d) return false;
  return +new Date(d) >= +now - 7 * 86400000;
}
