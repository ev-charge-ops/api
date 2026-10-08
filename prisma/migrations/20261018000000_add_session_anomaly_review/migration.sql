-- CreateEnum
CREATE TYPE "AnomalyReviewStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DISMISSED');

-- AlterTable
ALTER TABLE "ChargingSession" ADD COLUMN     "anomalyReviewNote" TEXT,
ADD COLUMN     "anomalyReviewStatus" "AnomalyReviewStatus",
ADD COLUMN     "anomalyReviewedAt" TIMESTAMP(3),
ADD COLUMN     "anomalyReviewedById" TEXT;

-- CreateIndex
CREATE INDEX "ChargingSession_organizationId_anomalyReviewStatus_idx" ON "ChargingSession"("organizationId", "anomalyReviewStatus");

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_anomalyReviewedById_fkey" FOREIGN KEY ("anomalyReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill
UPDATE "ChargingSession" SET "anomalyReviewStatus" = 'PENDING_REVIEW' WHERE "isAnomaly" = true;
