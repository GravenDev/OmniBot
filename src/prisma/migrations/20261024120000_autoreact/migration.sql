-- CreateTable
CREATE TABLE "AutoReaction" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "AutoReaction_pkey" PRIMARY KEY ("guildId","channelId")
);
