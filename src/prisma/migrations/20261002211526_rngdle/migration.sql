-- CreateTable
CREATE TABLE "RngdleAccount" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,

    CONSTRAINT "RngdleAccount_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "RngdleRoll" (
    "guildId" TEXT NOT NULL,
    "rollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "score" BIGINT NOT NULL,
    "badgeCount" INTEGER NOT NULL DEFAULT 0,
    "rolledAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RngdleRoll_pkey" PRIMARY KEY ("guildId","rollId")
);

-- CreateTable
CREATE TABLE "RngdleScoreTable" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RngdleScoreTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RngdleRoll_guildId_rolledAt_idx" ON "RngdleRoll"("guildId", "rolledAt");

-- CreateIndex
CREATE INDEX "RngdleRoll_guildId_userId_idx" ON "RngdleRoll"("guildId", "userId");
