-- Videos saved to a phone for watching without a network: who saved what, and when, so
-- that finishing or redoing a copy within a week is not charged twice.

-- CreateTable
CREATE TABLE "OfflineCopy" (
    "userId" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineCopy_pkey" PRIMARY KEY ("userId","videoId")
);

-- CreateIndex
CREATE INDEX "OfflineCopy_videoId_idx" ON "OfflineCopy"("videoId");

-- AddForeignKey
ALTER TABLE "OfflineCopy" ADD CONSTRAINT "OfflineCopy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCopy" ADD CONSTRAINT "OfflineCopy_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
