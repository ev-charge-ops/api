-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "autoRefund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "PaymentMode" NOT NULL DEFAULT 'TEST',
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeLiveCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeLiveCustomerId_key" ON "User"("stripeLiveCustomerId");

