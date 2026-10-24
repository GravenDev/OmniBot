-- CreateTable
CREATE TABLE "StickyMessage" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" TEXT,

    CONSTRAINT "StickyMessage_pkey" PRIMARY KEY ("guildId","channelId")
);
