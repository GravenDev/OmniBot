-- CreateTable
CREATE TABLE "ChessLiveGame" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "white" TEXT NOT NULL,
    "black" TEXT NOT NULL,
    "timeControl" TEXT NOT NULL DEFAULT '',
    "flipped" BOOLEAN NOT NULL DEFAULT false,
    "moves" TEXT NOT NULL DEFAULT '',
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChessLiveGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChessLiveGame_guildId_channelId_messageId_key" ON "ChessLiveGame"("guildId", "channelId", "messageId");

-- CreateIndex
CREATE INDEX "ChessLiveGame_finished_idx" ON "ChessLiveGame"("finished");
