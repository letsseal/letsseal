-- Detached (CAdES/CMS) seals for non-PDF artifacts, plus short proof codes.
-- Additive and backwards-compatible: existing rows default to sealType='pades'
-- and keep their pdfPath; proofCode is nullable (backfilled separately).
ALTER TABLE "SealedDocument" ALTER COLUMN "pdfPath" DROP NOT NULL;
ALTER TABLE "SealedDocument" ADD COLUMN "sealType" TEXT NOT NULL DEFAULT 'pades';
ALTER TABLE "SealedDocument" ADD COLUMN "detachedSig" TEXT;
ALTER TABLE "SealedDocument" ADD COLUMN "proofCode" TEXT;
ALTER TABLE "Anchor" ADD COLUMN "proofCode" TEXT;

CREATE UNIQUE INDEX "SealedDocument_proofCode_key" ON "SealedDocument"("proofCode");
CREATE UNIQUE INDEX "Anchor_proofCode_key" ON "Anchor"("proofCode");
