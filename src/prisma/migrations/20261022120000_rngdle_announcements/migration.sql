-- CreateTable
CREATE TABLE "RngdleAnnouncement" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "RngdleAnnouncement_pkey" PRIMARY KEY ("guildId","userId","day")
);

-- CreateTable
CREATE TABLE "RngdleAnnouncementOptOut" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RngdleAnnouncementOptOut_pkey" PRIMARY KEY ("guildId","userId")
);

