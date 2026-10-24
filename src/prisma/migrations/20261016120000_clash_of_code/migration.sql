-- CreateTable
CREATE TABLE "CocGame" (
    "guildId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "mode" TEXT,
    "status" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "startedAt" TIMESTAMP(3),
    "watchUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CocGame_pkey" PRIMARY KEY ("guildId","handle")
);

-- CreateTable
CREATE TABLE "CocPlayer" (
    "guildId" TEXT NOT NULL,
    "codingamerId" INTEGER NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarId" BIGINT,
    "userId" TEXT,

    CONSTRAINT "CocPlayer_pkey" PRIMARY KEY ("guildId","codingamerId")
);

-- CreateTable
CREATE TABLE "CocParticipation" (
    "guildId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "codingamerId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "criterion" INTEGER,
    "language" TEXT,

    CONSTRAINT "CocParticipation_pkey" PRIMARY KEY ("guildId","handle","codingamerId")
);

-- CreateIndex
CREATE INDEX "CocGame_guildId_status_idx" ON "CocGame"("guildId", "status");

-- CreateIndex
CREATE INDEX "CocPlayer_guildId_nickname_idx" ON "CocPlayer"("guildId", "nickname");

-- CreateIndex
CREATE UNIQUE INDEX "CocPlayer_guildId_userId_key" ON "CocPlayer"("guildId", "userId");

-- CreateIndex
CREATE INDEX "CocParticipation_guildId_codingamerId_idx" ON "CocParticipation"("guildId", "codingamerId");

-- AddForeignKey
ALTER TABLE "CocParticipation" ADD CONSTRAINT "CocParticipation_guildId_handle_fkey" FOREIGN KEY ("guildId", "handle") REFERENCES "CocGame"("guildId", "handle") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CocParticipation" ADD CONSTRAINT "CocParticipation_guildId_codingamerId_fkey" FOREIGN KEY ("guildId", "codingamerId") REFERENCES "CocPlayer"("guildId", "codingamerId") ON DELETE CASCADE ON UPDATE CASCADE;

