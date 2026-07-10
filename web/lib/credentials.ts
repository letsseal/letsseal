import { db } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { sealPdf, anchorHash } from "@/lib/signing";
import { generateCertificatePdf } from "@/lib/certificate-pdf";
import { appUrl, proofUrl } from "@/lib/hosted";
import { sendCredentialIssued } from "@/lib/mailer";
import { canSend, recordSend } from "@/lib/send-guard";

export type IssueInput = {
  recipientName: string;
  recipientEmail?: string | null;
  credType?: string;
  title: string;
  description?: string | null;
  credentialCode?: string | null;
  issuedOn?: Date;
  expiresOn?: Date | null;
};

export type IssuedCredential = { id: string; sha256: string; proofUrl: string; emailed: boolean };

export async function issueCredential(
  org: { id: string; slug: string; name: string; brandColor?: string | null; logoUrl?: string | null; fromEmail?: string | null },
  input: IssueInput,
): Promise<IssuedCredential> {
  const issuedOn = input.issuedOn ?? new Date();
  const cred = await db.credential.create({
    data: {
      orgId: org.id,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail || null,
      credType: input.credType || "Certificate",
      title: input.title,
      description: input.description || null,
      credentialCode: input.credentialCode || null,
      issuedOn,
      expiresOn: input.expiresOn || null,
    },
  });

  const link = `${appUrl()}/d/${cred.id}`; // keyed on the stable credential id

  // 2. Generate → 3. seal → 4. anchor.
  const pdf = await generateCertificatePdf(org, { ...input, credType: cred.credType, issuedOn }, link);
  const sealed = await sealPdf(org.slug, pdf, { reason: `Issued: ${cred.credType} — ${input.title}`, timestamp: false });
  const pdfPath = `credentials/${cred.id}/sealed.pdf`;
  await saveFile(pdfPath, sealed.pdf);

  let otsProof: string | null = null;
  let anchorState = "none";
  try {
    const a = await anchorHash(sealed.sha256);
    otsProof = a.ots_b64;
    anchorState = a.status.state;
  } catch { anchorState = "none"; }

  // 5. Persist the sealed doc (drives the proof page + verify) and link the sha.
  await db.sealedDocument.upsert({
    where: { sha256: sealed.sha256 },
    update: {},
    create: {
      orgId: org.id, source: "credential", title: `${cred.credType}: ${input.title}`,
      pdfPath, sha256: sealed.sha256, certCN: sealed.certCN, otsProof, anchorState,
    },
  });
  await db.credential.update({ where: { id: cred.id }, data: { sha256: sealed.sha256 } });

  // 6. Deliver the verification link to the recipient (best-effort).
  let emailed = false;
  if (input.recipientEmail && (await canSend(org.id)).ok) {
    try {
      emailed = await sendCredentialIssued({
        to: input.recipientEmail, recipientName: input.recipientName,
        credType: cred.credType, title: input.title, orgName: org.name,
        brandColor: org.brandColor ?? undefined, replyTo: org.fromEmail ?? undefined, link,
      });
      if (emailed) await recordSend(org.id, input.recipientEmail, "credential");
    } catch { emailed = false; }
  }

  return { id: cred.id, sha256: sealed.sha256, proofUrl: proofUrl(sealed.sha256), emailed };
}

export async function revokeCredential(orgId: string, id: string, reason?: string): Promise<boolean> {
  const cred = await db.credential.findFirst({ where: { id, orgId } });
  if (!cred) return false;
  if (!cred.revokedAt) {
    await db.credential.update({ where: { id }, data: { revokedAt: new Date(), revokedReason: reason || null } });
  }
  return true;
}
