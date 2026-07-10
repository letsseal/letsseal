-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "sendingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendingTrusted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSend_orgId_createdAt_idx" ON "EmailSend"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
