-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE', 'APPLE');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subject_key" ON "UserIdentity"("provider", "subject");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

