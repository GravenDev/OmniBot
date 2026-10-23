-- The table no longer holds announcements: it reserves one verified card per
-- member, per UTC day and per server. Renamed in place to keep its rows.
ALTER TABLE "RngdleAnnouncement" RENAME TO "RngdleCardClaim";
ALTER TABLE "RngdleCardClaim" RENAME CONSTRAINT "RngdleAnnouncement_pkey" TO "RngdleCardClaim_pkey";

-- The roll number was written but never read.
ALTER TABLE "RngdleCardClaim" DROP COLUMN "number";
