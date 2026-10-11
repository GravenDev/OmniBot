-- CreateTable
CREATE TABLE "MentionOptOut" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MentionOptOut_pkey" PRIMARY KEY ("guildId","userId")
);
