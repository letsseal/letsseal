-- Phase 1b tail: Organization.tenantId now required (all orgs backfilled + new orgs
-- always get a tenant). Prod has 0 orphan orgs, so this applies cleanly.

-- DropForeignKey
ALTER TABLE "Organization" DROP CONSTRAINT "Organization_tenantId_fkey";

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

