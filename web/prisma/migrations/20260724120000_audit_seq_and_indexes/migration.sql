
ALTER TABLE "AuditEvent" ADD COLUMN "seq" INTEGER;

WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "envelopeId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "AuditEvent"
)
UPDATE "AuditEvent" AS a
SET "seq" = numbered.rn
FROM numbered
WHERE a."id" = numbered."id";

ALTER TABLE "AuditEvent" ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX "AuditEvent_envelopeId_seq_key" ON "AuditEvent"("envelopeId", "seq");

CREATE INDEX "AuditEvent_envelopeId_createdAt_idx" ON "AuditEvent"("envelopeId", "createdAt");

CREATE INDEX "Envelope_orgId_createdAt_idx" ON "Envelope"("orgId", "createdAt");
CREATE INDEX "Envelope_orgId_status_idx" ON "Envelope"("orgId", "status");

CREATE INDEX "Signer_envelopeId_idx" ON "Signer"("envelopeId");
CREATE INDEX "Signer_envelopeId_status_idx" ON "Signer"("envelopeId", "status");

CREATE INDEX "Field_envelopeId_idx" ON "Field"("envelopeId");
CREATE INDEX "Field_signerId_idx" ON "Field"("signerId");
CREATE INDEX "Field_templateId_idx" ON "Field"("templateId");

CREATE INDEX "Template_orgId_idx" ON "Template"("orgId");

CREATE INDEX "Anchor_anchorState_createdAt_idx" ON "Anchor"("anchorState", "createdAt");
CREATE INDEX "SealedDocument_anchorState_sealedAt_idx" ON "SealedDocument"("anchorState", "sealedAt");
CREATE INDEX "SealedDocument_orgId_sealedAt_idx" ON "SealedDocument"("orgId", "sealedAt");

DROP INDEX "SealedDocument_sha256_key";
CREATE INDEX "SealedDocument_sha256_idx" ON "SealedDocument"("sha256");
CREATE UNIQUE INDEX "SealedDocument_orgId_sha256_sealType_key" ON "SealedDocument"("orgId", "sha256", "sealType");
