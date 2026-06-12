-- AlterTable
ALTER TABLE "public"."ModuleActivation" ALTER COLUMN "activatedVersion" SET DEFAULT '';

-- CreateTable
CREATE TABLE "public"."GuildConfiguration" (
    "guildId" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "GuildConfiguration_pkey" PRIMARY KEY ("guildId")
);
