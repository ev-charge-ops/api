-- CreateEnum
CREATE TYPE "ChargePointType" AS ENUM ('PRIVATE', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('TYPE_2', 'CCS_2');

-- CreateTable
CREATE TABLE "ChargePoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChargePointType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "maxPowerKw" DECIMAL(6,2) NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charger" (
    "id" TEXT NOT NULL,
    "chargePointId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "connector" "ConnectorType" NOT NULL DEFAULT 'TYPE_2',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chargePointId" TEXT,
    "utilityRateCents" INTEGER NOT NULL,
    "baseRateCents" INTEGER,
    "accessFeeCents" INTEGER NOT NULL,
    "idleFeeCentsPerMinute" INTEGER NOT NULL,
    "idleFeeCapCents" INTEGER NOT NULL,
    "gracePeriodMinutes" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChargePoint_type_idx" ON "ChargePoint"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ChargePoint_organizationId_code_key" ON "ChargePoint"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Charger_serialNumber_key" ON "Charger"("serialNumber");

-- CreateIndex
CREATE INDEX "Charger_chargePointId_idx" ON "Charger"("chargePointId");

-- CreateIndex
CREATE INDEX "Tariff_organizationId_chargePointId_validFrom_idx" ON "Tariff"("organizationId", "chargePointId", "validFrom");

-- AddForeignKey
ALTER TABLE "ChargePoint" ADD CONSTRAINT "ChargePoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charger" ADD CONSTRAINT "Charger_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

