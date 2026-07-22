-- Phase 1d(a): permanent DomainClaim registry (anti-impersonation lock). Additive.

-- CreateTable
CREATE TABLE "DomainClaim" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "tenantId" TEXT,
    "orgId" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainClaim_domain_key" ON "DomainClaim"("domain");

-- CreateIndex
CREATE INDEX "DomainClaim_tenantId_idx" ON "DomainClaim"("tenantId");

