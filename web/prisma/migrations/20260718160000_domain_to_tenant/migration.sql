-- Phase 1d-b: move verified issuer identity from Organization to the brand (Tenant),
-- so a brand proves control of a domain once and every entity under it inherits it.
-- Data is copied UP before the org columns are dropped. Single-org tenants (all
-- current) map 1:1; if several verified orgs ever shared a tenant, the first wins.

-- 1) Add the tenant-level columns.
ALTER TABLE "Tenant" ADD COLUMN "verifiedDomain" TEXT,
  ADD COLUMN "domainVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "domainVerifiedVia" TEXT;

-- 2) Copy each verified org's domain up to its tenant (DISTINCT ON = first per tenant).
UPDATE "Tenant" t
SET "verifiedDomain" = src."verifiedDomain",
    "domainVerifiedAt" = src."domainVerifiedAt",
    "domainVerifiedVia" = src."domainVerifiedVia"
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "verifiedDomain", "domainVerifiedAt", "domainVerifiedVia"
  FROM "Organization"
  WHERE "verifiedDomain" IS NOT NULL
  ORDER BY "tenantId", "domainVerifiedAt" ASC
) src
WHERE t."id" = src."tenantId";

-- 3) Enforce brand-level uniqueness, then drop the org-level columns.
CREATE UNIQUE INDEX "Tenant_verifiedDomain_key" ON "Tenant"("verifiedDomain");

DROP INDEX "Organization_verifiedDomain_key";
ALTER TABLE "Organization" DROP COLUMN "verifiedDomain",
  DROP COLUMN "domainVerifiedAt",
  DROP COLUMN "domainVerifiedVia";
