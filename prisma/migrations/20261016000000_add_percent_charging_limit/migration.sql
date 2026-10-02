-- AlterEnum
ALTER TYPE "ChargingLimitType" ADD VALUE 'PERCENT';

-- AlterTable
ALTER TABLE "ChargingSession" ADD COLUMN     "limitSocPercent" INTEGER;
