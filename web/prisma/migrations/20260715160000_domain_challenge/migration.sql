-- Domain-control challenges (Phase 2): self-serve issuer-identity verification.
-- One org per verified domain (unique index); challenges track the in-progress
-- DNS/email proof. Additive: new table + one unique index on an existing column.
CREATE UNIQUE INDEX "Organization_verifiedDomain_key" ON "Organization"("verifiedDomain");

CREATE TABLE "DomainChallenge" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "emailTarget" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "DomainChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DomainChallenge_token_key" ON "DomainChallenge"("token");
CREATE INDEX "DomainChallenge_orgId_idx" ON "DomainChallenge"("orgId");
CREATE INDEX "DomainChallenge_domain_idx" ON "DomainChallenge"("domain");
ALTER TABLE "DomainChallenge" ADD CONSTRAINT "DomainChallenge_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
