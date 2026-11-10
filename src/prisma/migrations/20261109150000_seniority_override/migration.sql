-- CreateTable
CREATE TABLE "SeniorityOverride" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeniorityOverride_pkey" PRIMARY KEY ("guildId","userId")
);
