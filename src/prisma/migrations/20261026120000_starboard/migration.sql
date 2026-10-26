-- CreateTable
CREATE TABLE "StarboardEntry" (
    "messageId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "starboardChannelId" TEXT NOT NULL,
    "starboardMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_starboardMessageId_key" ON "StarboardEntry"("starboardMessageId");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_channelId_idx" ON "StarboardEntry"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_starboardChannelId_idx" ON "StarboardEntry"("guildId", "starboardChannelId");

