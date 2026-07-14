-- Append-only Merkle transparency log (RFC 6962) + signed tree heads.
-- Additive and backwards-compatible: new tables only, no changes to existing rows.
CREATE TABLE "LogEntry" (
    "idx" SERIAL NOT NULL,
    "leafHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sealType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("idx")
);
CREATE UNIQUE INDEX "LogEntry_leafHash_key" ON "LogEntry"("leafHash");
CREATE INDEX "LogEntry_sha256_idx" ON "LogEntry"("sha256");

CREATE TABLE "TreeHead" (
    "id" TEXT NOT NULL,
    "treeSize" INTEGER NOT NULL,
    "rootHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "otsProof" TEXT,
    "anchorState" TEXT NOT NULL DEFAULT 'none',
    "btcBlock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreeHead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TreeHead_treeSize_idx" ON "TreeHead"("treeSize");
