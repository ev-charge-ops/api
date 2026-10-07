-- AlterTable
ALTER TABLE "ChargingSession" ADD COLUMN     "anomalyModelVersion" TEXT,
ADD COLUMN     "demandModelVersion" TEXT,
ADD COLUMN     "isAnomaly" BOOLEAN;

