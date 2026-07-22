-- Optional organizational attribution for signers (Phase 4).
-- All columns are nullable and additive — no backfill, zero-downtime.

-- AlterTable: envelope signer — per-signature title/department (e.g. "Senior Director", "Finance")
ALTER TABLE "Signer" ADD COLUMN "title" TEXT;
ALTER TABLE "Signer" ADD COLUMN "department" TEXT;

-- AlterTable: user signer-profile defaults
ALTER TABLE "User" ADD COLUMN "title" TEXT;
ALTER TABLE "User" ADD COLUMN "department" TEXT;
