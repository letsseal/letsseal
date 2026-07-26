ALTER TABLE "Signer" ADD COLUMN "remindersSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Signer" ADD COLUMN "lastReminderAt" TIMESTAMP(3);

CREATE INDEX "Signer_status_invitedAt_idx" ON "Signer"("status", "invitedAt");
