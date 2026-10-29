-- AlterTable
ALTER TABLE "ServerStatsDay" ADD COLUMN     "activeNewcomers" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServerStatsHour" (
    "guildId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerStatsHour_pkey" PRIMARY KEY ("guildId","day","hour")
);

-- CreateIndex
CREATE INDEX "ServerStatsHour_day_idx" ON "ServerStatsHour"("day");
