-- CreateTable
CREATE TABLE "ServerStatsGuild" (
    "guildId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerStatsGuild_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ServerStatsDay" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "joins" INTEGER NOT NULL DEFAULT 0,
    "leaves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerStatsDay_pkey" PRIMARY KEY ("guildId","day")
);

-- CreateTable
CREATE TABLE "ServerStatsChannel" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "channelId" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerStatsChannel_pkey" PRIMARY KEY ("guildId","day","channelId")
);

-- CreateTable
CREATE TABLE "ServerStatsMember" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerStatsMember_pkey" PRIMARY KEY ("guildId","day","userId")
);

-- CreateTable
CREATE TABLE "ServerStatsReaction" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "emoji" TEXT NOT NULL,
    "reactions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerStatsReaction_pkey" PRIMARY KEY ("guildId","day","emoji")
);

-- CreateIndex
CREATE INDEX "ServerStatsDay_day_idx" ON "ServerStatsDay"("day");

-- CreateIndex
CREATE INDEX "ServerStatsChannel_day_idx" ON "ServerStatsChannel"("day");

-- CreateIndex
CREATE INDEX "ServerStatsMember_day_idx" ON "ServerStatsMember"("day");

-- CreateIndex
CREATE INDEX "ServerStatsReaction_day_idx" ON "ServerStatsReaction"("day");

