-- the account is told when four fifths of the month's traffic are spent and when all of it is;
-- once a month each, written down on the month's row.
ALTER TYPE "NotificationType" ADD VALUE 'TRAFFIC_RUNNING_OUT';
ALTER TYPE "NotificationType" ADD VALUE 'TRAFFIC_USED_UP';

ALTER TABLE "TrafficUsage" ADD COLUMN "warnedAt" TIMESTAMP(3),
ADD COLUMN "usedUpAt" TIMESTAMP(3);
