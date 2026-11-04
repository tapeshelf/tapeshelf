-- A monthly traffic limit per account: what was watched and downloaded, counted by the size
-- of the file each time it starts. A stored "tiers" setting gets the new limit from its defaults.
ALTER TABLE "Video" ADD COLUMN "playbackBytes" BIGINT;

CREATE TABLE "TrafficUsage" (
    "userId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficUsage_pkey" PRIMARY KEY ("userId","month")
);

ALTER TABLE "TrafficUsage" ADD CONSTRAINT "TrafficUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
