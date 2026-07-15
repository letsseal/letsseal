-- Issuer identity verification (anti-impersonation, Phase 1). An organisation's
-- trusted identity is a globally-unique domain it proved control of; the free-text
-- name is only a label until then. Additive + nullable: every existing org keeps
-- NULL (unverified) and the /d proof page marks it as a self-asserted claim.
ALTER TABLE "Organization" ADD COLUMN "verifiedDomain" TEXT;
ALTER TABLE "Organization" ADD COLUMN "domainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "domainVerifiedVia" TEXT;
