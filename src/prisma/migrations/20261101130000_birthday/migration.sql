-- CreateTable
CREATE TABLE "Birthday" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "announce" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Birthday_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "BirthdayState" (
    "guildId" TEXT NOT NULL,
    "lastDay" TEXT,
    "milestones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstCollisionCount" INTEGER,

    CONSTRAINT "BirthdayState_pkey" PRIMARY KEY ("guildId")
);
