-- AlterTable
ALTER TABLE "FourHourGameLastMessage" ADD COLUMN "scoringFrom" TIMESTAMP(3);

-- The message in place counts from its own time, unless the server's last
-- point is later: then it is back in place after a deletion, and must not
-- score again for the time before that point.
UPDATE "FourHourGameLastMessage" AS last
SET "scoringFrom" = GREATEST(
    last."sentAt",
    COALESCE(
        (
            SELECT MAX(point."awardedAt")
            FROM "FourHourGamePoint" AS point
            WHERE point."guildId" = last."guildId"
        ),
        last."sentAt"
    )
);

ALTER TABLE "FourHourGameLastMessage" ALTER COLUMN "scoringFrom" SET NOT NULL;
