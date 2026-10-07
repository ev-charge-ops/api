-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "replacedById" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);
