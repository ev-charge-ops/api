-- CreateEnum
CREATE TYPE "OneTimeTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_LOGIN');

-- CreateTable
CREATE TABLE "OneTimeToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "OneTimeTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneTimeToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OneTimeToken_tokenHash_key" ON "OneTimeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OneTimeToken_userId_type_idx" ON "OneTimeToken"("userId", "type");

-- AddForeignKey
ALTER TABLE "OneTimeToken" ADD CONSTRAINT "OneTimeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

