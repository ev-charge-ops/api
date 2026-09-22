-- CreateEnum
CREATE TYPE "ChargingSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'GRACE', 'IDLE', 'CLOSED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "ChargingLimitType" AS ENUM ('ENERGY', 'AMOUNT', 'FULL');

-- CreateEnum
CREATE TYPE "DemandFactorSource" AS ENUM ('RULE', 'MODEL');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "commonAreaReserveKw" DECIMAL(7,2),
ADD COLUMN     "contractedDemandKw" DECIMAL(7,2),
ADD COLUMN     "minChargingPowerKw" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "ChargingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chargePointId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitLabel" TEXT,
    "regime" "ChargePointType" NOT NULL,
    "status" "ChargingSessionStatus" NOT NULL DEFAULT 'PENDING',
    "limitType" "ChargingLimitType" NOT NULL DEFAULT 'FULL',
    "limitEnergyKwh" DECIMAL(10,3),
    "limitAmountCents" INTEGER,
    "targetEnergyKwh" DECIMAL(10,3),
    "allocatedPowerKw" DECIMAL(6,2) NOT NULL,
    "batteryCapacityKwh" DECIMAL(6,2),
    "initialSocPercent" INTEGER,
    "timeScale" INTEGER NOT NULL DEFAULT 1,
    "lockedRateCents" INTEGER NOT NULL,
    "demandFactor" DECIMAL(4,2) NOT NULL,
    "demandFactorSource" "DemandFactorSource" NOT NULL,
    "idleFeeCentsPerMinute" INTEGER NOT NULL,
    "idleFeeCapCents" INTEGER NOT NULL,
    "gracePeriodMinutes" INTEGER NOT NULL,
    "externalTransactionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "chargingEndedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "telemetryReadAt" TIMESTAMP(3),
    "energyKwh" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "powerKw" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "socPercent" INTEGER,
    "energyCostCents" INTEGER NOT NULL DEFAULT 0,
    "idleMinutes" INTEGER NOT NULL DEFAULT 0,
    "idleFeeCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "anomalyScore" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "energyKwh" DECIMAL(10,3) NOT NULL,
    "powerKw" DECIMAL(6,2) NOT NULL,
    "socPercent" INTEGER,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChargingSession_userId_status_idx" ON "ChargingSession"("userId", "status");

-- CreateIndex
CREATE INDEX "ChargingSession_chargePointId_status_idx" ON "ChargingSession"("chargePointId", "status");

-- CreateIndex
CREATE INDEX "ChargingSession_organizationId_startedAt_idx" ON "ChargingSession"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "MeterReading_sessionId_at_idx" ON "MeterReading"("sessionId", "at");

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

