-- CreateTable
CREATE TABLE "StarboardEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "originalMessageId" TEXT NOT NULL,
    "originalChannelId" TEXT NOT NULL,
    "starboardMessageId" TEXT NOT NULL,
    "starboardChannelId" TEXT NOT NULL,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_idx" ON "StarboardEntry"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_guildId_originalMessageId_key" ON "StarboardEntry"("guildId", "originalMessageId");
