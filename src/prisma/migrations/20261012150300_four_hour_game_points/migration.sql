-- CreateTable
CREATE TABLE "FourHourGamePoint" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "heldSeconds" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FourHourGamePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FourHourGamePoint_guildId_userId_idx" ON "FourHourGamePoint"("guildId", "userId");

-- CreateIndex
CREATE INDEX "FourHourGamePoint_guildId_awardedAt_idx" ON "FourHourGamePoint"("guildId", "awardedAt");

