-- CreateEnum
CREATE TYPE "QueueEntryStatus" AS ENUM ('WAITING', 'NOTIFIED', 'EXPIRED', 'LEFT', 'FULFILLED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUEUE_TURN';

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "chargePointId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "QueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "reservedUntil" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueueEntry_chargePointId_status_createdAt_idx" ON "QueueEntry"("chargePointId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "QueueEntry_userId_status_idx" ON "QueueEntry"("userId", "status");

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_chargePointId_fkey" FOREIGN KEY ("chargePointId") REFERENCES "ChargePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

