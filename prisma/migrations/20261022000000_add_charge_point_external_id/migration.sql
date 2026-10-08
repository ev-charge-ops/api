-- AlterEnum
ALTER TYPE "ConnectorType" ADD VALUE 'CHADEMO';
ALTER TYPE "ConnectorType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "ChargePoint" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChargePoint_source_externalId_key" ON "ChargePoint"("source", "externalId");
