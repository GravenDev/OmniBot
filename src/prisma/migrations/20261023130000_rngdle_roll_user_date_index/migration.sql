-- DropIndex
DROP INDEX "RngdleRoll_guildId_userId_idx";

-- CreateIndex
CREATE INDEX "RngdleRoll_guildId_userId_rolledAt_idx" ON "RngdleRoll"("guildId", "userId", "rolledAt");

