-- CreateEnum
CREATE TYPE "ChargePointSource" AS ENUM ('SEED', 'OCM');

-- AlterTable
ALTER TABLE "ChargePoint" ADD COLUMN     "source" "ChargePointSource" NOT NULL DEFAULT 'SEED';

-- CreateIndex
CREATE INDEX "ChargePoint_latitude_longitude_idx" ON "ChargePoint"("latitude", "longitude");

