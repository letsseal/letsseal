-- Anti-impersonation moderation (Phase 3): org suspension + public abuse reports.
-- Additive: new nullable columns (status defaults 'active' so existing orgs are
-- unaffected) + a new AbuseReport table.
ALTER TABLE "Organization" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "suspendedReason" TEXT;

CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "detail" TEXT,
    "reporterEmail" TEXT,
    "proofHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledNote" TEXT,
    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AbuseReport_orgId_idx" ON "AbuseReport"("orgId");
CREATE INDEX "AbuseReport_status_idx" ON "AbuseReport"("status");
ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
