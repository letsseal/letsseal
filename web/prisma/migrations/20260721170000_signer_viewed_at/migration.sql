-- Record the first time a recipient opens their signing link, so the issuer can
-- see "opened at least once" with a timestamp. The status already flips to
-- "viewed" on open; this adds the moment as a first-class column.
ALTER TABLE "Signer" ADD COLUMN "viewedAt" TIMESTAMP(3);
