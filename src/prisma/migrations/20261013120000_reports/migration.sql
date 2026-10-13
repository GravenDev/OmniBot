-- CreateTable
CREATE TABLE "MessageReport" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL,
    "messageCreatedAt" TIMESTAMP(3) NOT NULL,
    "messageState" TEXT NOT NULL DEFAULT 'present',
    "editedContent" TEXT,
    "reactionKept" BOOLEAN NOT NULL DEFAULT false,
    "alertChannelId" TEXT,
    "alertMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReporter" (
    "reportId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReporter_pkey" PRIMARY KEY ("reportId","userId")
);

-- CreateTable
CREATE TABLE "ReportAction" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "duration" INTEGER,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageReport_guildId_authorId_idx" ON "MessageReport"("guildId", "authorId");

-- CreateIndex
CREATE INDEX "MessageReport_status_handledAt_idx" ON "MessageReport"("status", "handledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_guildId_messageId_key" ON "MessageReport"("guildId", "messageId");

-- CreateIndex
CREATE INDEX "ReportAction_reportId_idx" ON "ReportAction"("reportId");

-- AddForeignKey
ALTER TABLE "MessageReporter" ADD CONSTRAINT "MessageReporter_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MessageReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAction" ADD CONSTRAINT "ReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MessageReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

