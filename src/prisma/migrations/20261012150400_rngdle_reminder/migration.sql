-- CreateTable
CREATE TABLE "RngdleReminder" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "RngdleReminder_pkey" PRIMARY KEY ("guildId","userId")
);
