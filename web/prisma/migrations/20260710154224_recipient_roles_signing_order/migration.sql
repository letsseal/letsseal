-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "sequential" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Signer" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'signer';
