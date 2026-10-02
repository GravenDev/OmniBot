-- CreateTable
CREATE TABLE "FourHourGameScore" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "FourHourGameScore_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "FourHourGameLastMessage" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FourHourGameLastMessage_pkey" PRIMARY KEY ("guildId")
);
