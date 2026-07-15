-- Identity seals (sealType="identity") bind a third-party-verified email into a
-- short-lived cert. Record which OIDC provider/issuer vouched, so the /d proof
-- page can attribute the seal ("verified via google"). Additive + nullable: no
-- backfill, every existing (non-identity) row keeps NULL for both columns.
ALTER TABLE "SealedDocument" ADD COLUMN "oidcProvider" TEXT;
ALTER TABLE "SealedDocument" ADD COLUMN "oidcIssuer" TEXT;
