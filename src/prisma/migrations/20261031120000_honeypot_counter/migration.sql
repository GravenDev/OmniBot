-- CreateTable
CREATE TABLE "HoneypotCounter" (
    "guildId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMP(3),
    "channelId" TEXT,
    "messageId" TEXT,

    CONSTRAINT "HoneypotCounter_pkey" PRIMARY KEY ("guildId")
);
