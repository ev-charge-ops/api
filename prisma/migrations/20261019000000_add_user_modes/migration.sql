-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "LocationMode" AS ENUM ('DEMO', 'DEVICE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoRefund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationMode" "LocationMode" NOT NULL DEFAULT 'DEMO',
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'TEST';
