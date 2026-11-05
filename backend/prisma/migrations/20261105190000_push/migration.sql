-- Push notifications for the phone app: its devices, what a push says, and a third
-- channel in the notification settings.

ALTER TABLE "NotificationPreference" ADD COLUMN "push" BOOLEAN;

CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Device_sessionId_key" ON "Device"("sessionId");
CREATE UNIQUE INDEX "Device_token_key" ON "Device"("token");
CREATE UNIQUE INDEX "Device_keyHash_key" ON "Device"("keyHash");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushMessage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "notificationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushMessage_userId_id_idx" ON "PushMessage"("userId", "id");
CREATE INDEX "PushMessage_createdAt_idx" ON "PushMessage"("createdAt");

ALTER TABLE "PushMessage" ADD CONSTRAINT "PushMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
