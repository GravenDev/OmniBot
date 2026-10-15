-- CreateTable
CREATE TABLE "FourHourGameDailyBest" (
    "guildId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "heldSeconds" INTEGER NOT NULL,

    CONSTRAINT "FourHourGameDailyBest_pkey" PRIMARY KEY ("guildId","day")
);

-- CreateTable
CREATE TABLE "FourHourGameDailyState" (
    "guildId" TEXT NOT NULL,
    "closedDay" TEXT NOT NULL,

    CONSTRAINT "FourHourGameDailyState_pkey" PRIMARY KEY ("guildId")
);

-- CreateIndex
CREATE INDEX "FourHourGameDailyBest_guildId_userId_idx" ON "FourHourGameDailyBest"("guildId", "userId");

