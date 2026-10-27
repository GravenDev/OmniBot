-- CreateTable
CREATE TABLE "TempVoiceHub" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "nameTemplate" TEXT NOT NULL,
    "userLimit" INTEGER NOT NULL,

    CONSTRAINT "TempVoiceHub_pkey" PRIMARY KEY ("guildId","channelId")
);

-- CreateTable
CREATE TABLE "TempVoiceChannel" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "trusted" TEXT[],
    "blocked" TEXT[],
    "panelMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TempVoiceChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "TempVoicePreference" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "userLimit" INTEGER,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "trusted" TEXT[],
    "blocked" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TempVoicePreference_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TempVoiceChannel_guildId_ownerId_key" ON "TempVoiceChannel"("guildId", "ownerId");

