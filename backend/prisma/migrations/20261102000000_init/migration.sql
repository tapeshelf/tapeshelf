
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TYPE public."AccessSource" AS ENUM (
    'AUTHOR',
    'EXCHANGE',
    'SHARE',
    'PUBLIC_ADD'
);

CREATE TYPE public."DeleteReason" AS ENUM (
    'USER',
    'ACCOUNT_DELETED',
    'ADMIN'
);

CREATE TYPE public."EmailTokenType" AS ENUM (
    'VERIFY_EMAIL',
    'RESET_PASSWORD',
    'GUEST_EMAIL'
);

CREATE TYPE public."GivingSide" AS ENUM (
    'HOLDER',
    'REQUESTER'
);

CREATE TYPE public."Locale" AS ENUM (
    'en',
    'ru',
    'es',
    'pt',
    'fr',
    'de',
    'it',
    'pl',
    'uk',
    'tr',
    'nl',
    'cs',
    'sv',
    'ja',
    'ko',
    'zh',
    'id',
    'vi',
    'th',
    'hi'
);

CREATE TYPE public."NotificationType" AS ENUM (
    'REQUEST_RECEIVED',
    'OFFER_RECEIVED',
    'REQUEST_SHARED',
    'EXCHANGE_COMPLETED',
    'REQUEST_DECLINED',
    'REQUEST_CANCELLED',
    'REQUEST_INVALIDATED',
    'NEW_FOLLOWER',
    'FRIEND_ACCEPTED',
    'FOLLOWED_NEW_VIDEO',
    'NEW_MESSAGE',
    'VIDEO_PROCESSED',
    'VIDEO_FAILED',
    'VIDEO_REMOVED',
    'REPORT_RESOLVED',
    'ADMIN_NOTICE',
    'PLAN_EXPIRING',
    'PLAN_EXPIRED',
    'VIDEO_TAKEN_DOWN',
    'PLAN_PAYMENT_FAILED',
    'VIDEO_EDITED',
    'VIDEO_EDIT_FAILED',
    'SUPPORT_REPLY',
    'SUPPORT_TICKET',
    'LINK_OPENED',
    'LINK_SAVED'
);

CREATE TYPE public."OAuthProvider" AS ENUM (
    'GOOGLE'
);

CREATE TYPE public."OfferStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'SUPERSEDED',
    'VOID'
);

CREATE TYPE public."ProcessingStage" AS ENUM (
    'PROBE',
    'FRAMES',
    'SHEET',
    'PACKAGE',
    'ENCRYPT',
    'UPLOAD',
    'EDIT'
);

CREATE TYPE public."ReportReason" AS ENUM (
    'SPAM',
    'ILLEGAL',
    'COPYRIGHT',
    'ABUSE',
    'OTHER',
    'UNMARKED_ADULT'
);

CREATE TYPE public."ReportStatus" AS ENUM (
    'OPEN',
    'RESOLVED',
    'DISMISSED'
);

CREATE TYPE public."ReportTarget" AS ENUM (
    'VIDEO',
    'USER'
);

CREATE TYPE public."RequestStatus" AS ENUM (
    'OPEN',
    'ACCEPTED',
    'DECLINED',
    'CANCELLED',
    'BLOCKED',
    'INVALIDATED',
    'DRAFT',
    'EXPIRED'
);

CREATE TYPE public."Role" AS ENUM (
    'USER',
    'ADMIN'
);

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'ACTIVE',
    'TRIALING',
    'PAST_DUE',
    'PAUSED',
    'CANCELED'
);

CREATE TYPE public."SupportMessageKind" AS ENUM (
    'USER',
    'SUPPORT',
    'NOTE'
);

CREATE TYPE public."SupportPriority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH'
);

CREATE TYPE public."SupportStatus" AS ENUM (
    'OPEN',
    'WAITING',
    'RESOLVED',
    'CLOSED'
);

CREATE TYPE public."SupportTopic" AS ENUM (
    'QUESTION',
    'BUG',
    'ACCOUNT',
    'IDEA'
);

CREATE TYPE public."Theme" AS ENUM (
    'DARK',
    'LIGHT',
    'SYSTEM'
);

CREATE TYPE public."Tier" AS ENUM (
    'BASIC',
    'PREMIUM'
);

CREATE TYPE public."TierSource" AS ENUM (
    'ADMIN',
    'PADDLE'
);

CREATE TYPE public."TrashExit" AS ENUM (
    'EMPTIED',
    'REMOVED',
    'EXPIRED',
    'BANNED',
    'ACCOUNT_DELETED',
    'ADMIN'
);

CREATE TYPE public."UploadStatus" AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'ABORTED',
    'EXPIRED'
);

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'BANNED',
    'DELETED',
    'GUEST'
);

CREATE TYPE public."VideoStatus" AS ENUM (
    'QUEUED',
    'PROCESSING',
    'READY',
    'FAILED'
);

CREATE TYPE public."Visibility" AS ENUM (
    'PUBLIC',
    'PRIVATE'
);

CREATE FUNCTION public.gen_video_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  alphabet CONSTANT text := '23456789abcdefghjkmnpqrstuvwxyz';
  digits CONSTANT text := '23456789';
  -- the fully random bytes of a v4 uuid (6 and 8 carry version and variant bits)
  picks CONSTANT int[] := ARRAY[0, 1, 2, 3, 4, 5, 9];
  r bytea;
  c text;
BEGIN
  LOOP
    r := uuid_send(gen_random_uuid());
    c := '';
    FOR i IN 1..7 LOOP
      c := c || substr(alphabet, 1 + get_byte(r, picks[i]) % 31, 1);
    END LOOP;
    IF c !~ '[0-9]' THEN
      c := overlay(c PLACING substr(digits, 1 + get_byte(r, 10) % 8, 1) FROM 1 + get_byte(r, 11) % 7 FOR 1);
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "Video" WHERE code = c)
      AND NOT EXISTS (SELECT 1 FROM "AnonymousCode" WHERE code = c);
  END LOOP;
  RETURN c;
END
$$;

CREATE TABLE public."AnonymousCode" (
    code character varying(7) DEFAULT public.gen_video_code() NOT NULL,
    "linkId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."AnonymousLink" (
    id uuid NOT NULL,
    code character varying(10) NOT NULL,
    "ownerId" uuid NOT NULL,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    name text
);

CREATE TABLE public."AppToken" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    name text NOT NULL,
    "tokenHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone
);

CREATE TABLE public."AuditLog" (
    id uuid NOT NULL,
    "actorId" uuid,
    action text NOT NULL,
    "targetType" text NOT NULL,
    "targetId" text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."BillingEvent" (
    id text NOT NULL,
    type text NOT NULL,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Block" (
    "blockerId" uuid NOT NULL,
    "blockedId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."BlockedFile" (
    id uuid NOT NULL,
    sha256 character(64),
    "videoId" uuid,
    rule public."ReportReason" NOT NULL,
    "createdById" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Category" (
    id uuid NOT NULL,
    "ownerId" uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "coverVideoId" uuid,
    "previewRows" integer,
    "tileScale" text,
    CONSTRAINT "Category_previewRows_check" CHECK ((("previewRows" IS NULL) OR (("previewRows" >= 0) AND ("previewRows" <= 6)))),
    CONSTRAINT "Category_tileScale_check" CHECK ((("tileScale" IS NULL) OR ("tileScale" = ANY (ARRAY['xs'::text, 'sm'::text, 'md'::text, 'lg'::text, 'xl'::text]))))
);

CREATE TABLE public."Conversation" (
    id uuid NOT NULL,
    "userAId" uuid NOT NULL,
    "userBId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastMessageAt" timestamp(3) without time zone,
    CONSTRAINT "Conversation_pair_ordered" CHECK (("userAId" < "userBId"))
);

CREATE TABLE public."ConversationParticipant" (
    "conversationId" uuid NOT NULL,
    "userId" uuid NOT NULL,
    "lastReadMessageId" uuid
);

CREATE TABLE public."DownloadEvent" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    tier public."Tier" NOT NULL,
    counted boolean NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."EmailToken" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    type public."EmailTokenType" NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."ExchangeLink" (
    id uuid NOT NULL,
    code text NOT NULL,
    "ownerId" uuid NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."ExchangeLinkItem" (
    "linkId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    "position" integer NOT NULL
);

CREATE TABLE public."ExchangeOffer" (
    id uuid NOT NULL,
    "requestId" uuid NOT NULL,
    round integer NOT NULL,
    "proposedById" uuid NOT NULL,
    status public."OfferStatus" DEFAULT 'PENDING'::public."OfferStatus" NOT NULL,
    message text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "respondedAt" timestamp(3) without time zone
);

CREATE TABLE public."ExchangeOfferItem" (
    "offerId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    "givingSide" public."GivingSide" NOT NULL
);

CREATE TABLE public."Follow" (
    "followerId" uuid NOT NULL,
    "followeeId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Follow_not_self" CHECK (("followerId" <> "followeeId"))
);

CREATE TABLE public."FriendInvite" (
    id uuid NOT NULL,
    code text NOT NULL,
    "inviterId" uuid NOT NULL,
    "maxUses" integer NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Message" (
    id uuid NOT NULL,
    "conversationId" uuid NOT NULL,
    "senderId" uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    "videoId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Message_body_length" CHECK ((char_length(body) <= 4000))
);

CREATE TABLE public."Notification" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    type public."NotificationType" NOT NULL,
    payload jsonb NOT NULL,
    "readAt" timestamp(3) without time zone,
    "emailedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."NotificationPreference" (
    "userId" uuid NOT NULL,
    type public."NotificationType" NOT NULL,
    "inApp" boolean NOT NULL,
    email boolean NOT NULL
);

CREATE TABLE public."OAuthAccount" (
    id uuid NOT NULL,
    provider public."OAuthProvider" NOT NULL,
    "providerUserId" text NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    email text
);

CREATE TABLE public."OutboxEvent" (
    id uuid NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp(3) without time zone,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "nextAttemptAt" timestamp(3) without time zone
);

CREATE TABLE public."Passkey" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "credentialId" text NOT NULL,
    "publicKey" bytea NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports text[],
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone
);

CREATE TABLE public."RecoveryCode" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "codeHash" text NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Report" (
    id uuid NOT NULL,
    "reporterId" uuid NOT NULL,
    "targetType" public."ReportTarget" NOT NULL,
    "targetUserId" uuid NOT NULL,
    "videoId" uuid,
    reason public."ReportReason" NOT NULL,
    comment text,
    status public."ReportStatus" DEFAULT 'OPEN'::public."ReportStatus" NOT NULL,
    action text,
    note text,
    "resolvedById" uuid,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Report_comment_length" CHECK ((char_length(comment) <= 1000)),
    CONSTRAINT "Report_target_shape" CHECK ((("targetType" = 'VIDEO'::public."ReportTarget") = ("videoId" IS NOT NULL)))
);

CREATE TABLE public."RequestCooldown" (
    "requesterId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    until timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Session" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "refreshTokenHash" text NOT NULL,
    "userAgent" text,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "secondFactorAt" timestamp(3) without time zone
);

CREATE TABLE public."ShareLink" (
    id uuid NOT NULL,
    code text NOT NULL,
    "senderId" uuid NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "passwordHash" text,
    email text,
    "openedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."ShareLinkItem" (
    "linkId" uuid NOT NULL,
    "videoId" uuid NOT NULL,
    "position" integer NOT NULL
);

CREATE TABLE public."ShelfVisit" (
    "visitorId" uuid NOT NULL,
    "ownerId" uuid NOT NULL,
    "lastSeenAt" timestamp(3) without time zone NOT NULL,
    "newSince" timestamp(3) without time zone
);

CREATE TABLE public."SiteSetting" (
    key text NOT NULL,
    value jsonb NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Subscription" (
    id text NOT NULL,
    "userId" uuid NOT NULL,
    "customerId" text NOT NULL,
    status public."SubscriptionStatus" NOT NULL,
    "priceId" text NOT NULL,
    "interval" text NOT NULL,
    "periodEndsAt" timestamp(3) without time zone,
    "endsAt" timestamp(3) without time zone,
    "pastDueSince" timestamp(3) without time zone,
    "eventAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "cancelledForBan" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."SupportAttachment" (
    id uuid NOT NULL,
    "messageId" uuid NOT NULL,
    key text NOT NULL,
    "contentType" text NOT NULL,
    size integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."SupportMessage" (
    id uuid NOT NULL,
    "ticketId" uuid NOT NULL,
    "authorId" uuid NOT NULL,
    kind public."SupportMessageKind" NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SupportMessage_body_length" CHECK ((char_length(body) <= 5000))
);

CREATE TABLE public."SupportTicket" (
    id uuid NOT NULL,
    number integer NOT NULL,
    "userId" uuid NOT NULL,
    topic public."SupportTopic" NOT NULL,
    subject text NOT NULL,
    status public."SupportStatus" DEFAULT 'OPEN'::public."SupportStatus" NOT NULL,
    priority public."SupportPriority" DEFAULT 'NORMAL'::public."SupportPriority" NOT NULL,
    "videoId" uuid,
    context jsonb,
    helped boolean,
    "statusAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "activityAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unread boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SupportTicket_subject_length" CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 120)))
);

CREATE SEQUENCE public."SupportTicket_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public."SupportTicket_number_seq" OWNED BY public."SupportTicket".number;

CREATE TABLE public."UploadSession" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    key text NOT NULL,
    "s3UploadId" text NOT NULL,
    filename text NOT NULL,
    "mimeType" text,
    "declaredSize" bigint NOT NULL,
    "partSize" integer NOT NULL,
    status public."UploadStatus" DEFAULT 'ACTIVE'::public."UploadStatus" NOT NULL,
    "videoId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "appTokenId" uuid,
    "audioDeclaredSize" bigint,
    "audioFilename" text,
    "audioKey" text,
    "audioS3UploadId" text,
    "sizeIsMax" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."User" (
    id uuid NOT NULL,
    email text,
    "emailVerifiedAt" timestamp(3) without time zone,
    "passwordHash" text,
    username text NOT NULL,
    "displayName" text NOT NULL,
    "avatarKey" text,
    "coverKey" text,
    bio text,
    "accentColor" text,
    locale public."Locale" DEFAULT 'en'::public."Locale" NOT NULL,
    theme public."Theme" DEFAULT 'SYSTEM'::public."Theme" NOT NULL,
    role public."Role" DEFAULT 'USER'::public."Role" NOT NULL,
    tier public."Tier" DEFAULT 'BASIC'::public."Tier" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "bannedAt" timestamp(3) without time zone,
    "pageSettings" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "storageUsedBytes" bigint DEFAULT 0 NOT NULL,
    "requestHintSeenCount" integer DEFAULT 0 NOT NULL,
    "requestHintDismissed" boolean DEFAULT false NOT NULL,
    "usernameChangedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "lastLoginAt" timestamp(3) without time zone,
    "banReason" text,
    "coverPattern" integer,
    "showSensitive" boolean DEFAULT false NOT NULL,
    "tierReminder" integer,
    "tierSource" public."TierSource",
    "tierUntil" timestamp(3) without time zone,
    "whatsNewSeenAt" timestamp(3) without time zone,
    "pendingInviteId" uuid,
    "pageHidden" boolean DEFAULT false NOT NULL,
    "twoFactorAt" timestamp(3) without time zone,
    "totpSecret" text,
    "totpLastStep" integer,
    "acceptGuestExchanges" boolean DEFAULT true NOT NULL,
    "exchangeAvoid" text,
    "exchangeWants" text,
    "guestEmail" text,
    "guestEmailVerifiedAt" timestamp(3) without time zone,
    "guestKeyHash" text,
    "showExchangePrefs" boolean DEFAULT false NOT NULL,
    "guestKeySealed" text
);

CREATE TABLE public."UsernameHistory" (
    username text NOT NULL,
    "userId" uuid NOT NULL,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Video" (
    id uuid NOT NULL,
    "authorId" uuid NOT NULL,
    title text NOT NULL,
    description text,
    visibility public."Visibility" DEFAULT 'PRIVATE'::public."Visibility" NOT NULL,
    status public."VideoStatus" DEFAULT 'QUEUED'::public."VideoStatus" NOT NULL,
    stage public."ProcessingStage",
    progress integer DEFAULT 0 NOT NULL,
    "failReason" text,
    "failDetail" text,
    "originalKey" text NOT NULL,
    "originalFilename" text NOT NULL,
    "mimeType" text,
    "sizeBytes" bigint NOT NULL,
    "durationSec" double precision,
    width integer,
    height integer,
    probe jsonb,
    "hlsPrefix" text,
    "keyVersion" integer DEFAULT 1 NOT NULL,
    "segmentCount" integer,
    "assetPrefix" text,
    "contactSheetKey" text,
    "thumbnailKey" text,
    "thumbnailFrameIndex" integer,
    "processingAttempts" integer DEFAULT 0 NOT NULL,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "deletedById" uuid,
    "deleteReason" public."DeleteReason",
    "purgedAt" timestamp(3) without time zone,
    "storedBytes" bigint,
    sensitive boolean DEFAULT false NOT NULL,
    "smallFrames" boolean DEFAULT false NOT NULL,
    "thumbnailSmallKey" text,
    code character varying(7) DEFAULT public.gen_video_code() NOT NULL,
    "originalSha256" character(64),
    "takedownNote" text,
    "takedownRule" public."ReportReason",
    "readyAt" timestamp(3) without time zone,
    edit jsonb,
    "editJob" jsonb,
    "editRevision" integer DEFAULT 0 NOT NULL,
    "renderBytes" bigint,
    "renderKey" text,
    "sourceInfo" jsonb,
    "sourceKeyVersion" integer,
    "trashExitAt" timestamp(3) without time zone,
    "trashExit" public."TrashExit",
    "sheetVersion" integer DEFAULT 0 NOT NULL,
    "sourceMetadata" jsonb,
    "uploadedSize" bigint,
    "dealId" uuid,
    "plainSheetKey" text,
    "audioKey" text,
    "audioSizeBytes" bigint,
    "sourceUrl" text
);

CREATE TABLE public."VideoAccess" (
    id uuid NOT NULL,
    "videoId" uuid NOT NULL,
    "holderId" uuid NOT NULL,
    source public."AccessSource" NOT NULL,
    "grantedById" uuid,
    "requestId" uuid,
    "categoryId" uuid,
    "position" integer DEFAULT 0 NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "stackId" uuid,
    unseen boolean DEFAULT false NOT NULL,
    "customDescription" text,
    "customTitle" text,
    inbox boolean DEFAULT false NOT NULL,
    pinned integer,
    "anonymousLinkId" uuid
);

CREATE TABLE public."VideoFrame" (
    id uuid NOT NULL,
    "videoId" uuid NOT NULL,
    index integer NOT NULL,
    "timestampSec" double precision NOT NULL,
    key text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL
);

CREATE TABLE public."VideoRequest" (
    id uuid NOT NULL,
    "requesterId" uuid NOT NULL,
    "holderId" uuid NOT NULL,
    status public."RequestStatus" DEFAULT 'OPEN'::public."RequestStatus" NOT NULL,
    round integer DEFAULT 0 NOT NULL,
    "currentOfferId" uuid,
    "awaitingUserId" uuid,
    message text,
    "declineComment" text,
    "resolvedById" uuid,
    "resolvedAt" timestamp(3) without time zone,
    "resetAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "exchangeLinkId" uuid,
    "expiresAt" timestamp(3) without time zone,
    "guestAccessUntil" timestamp(3) without time zone,
    "anonymousLinkId" uuid
);

CREATE TABLE public."VideoStack" (
    id uuid NOT NULL,
    "ownerId" uuid NOT NULL,
    name text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "coverVideoId" uuid,
    pinned integer
);

ALTER TABLE ONLY public."SupportTicket" ALTER COLUMN number SET DEFAULT nextval('public."SupportTicket_number_seq"'::regclass);

ALTER TABLE ONLY public."AnonymousCode"
    ADD CONSTRAINT "AnonymousCode_pkey" PRIMARY KEY (code);

ALTER TABLE ONLY public."AnonymousLink"
    ADD CONSTRAINT "AnonymousLink_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."AppToken"
    ADD CONSTRAINT "AppToken_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."BillingEvent"
    ADD CONSTRAINT "BillingEvent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId", "blockedId");

ALTER TABLE ONLY public."BlockedFile"
    ADD CONSTRAINT "BlockedFile_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId", "userId");

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."DownloadEvent"
    ADD CONSTRAINT "DownloadEvent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."EmailToken"
    ADD CONSTRAINT "EmailToken_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ExchangeLinkItem"
    ADD CONSTRAINT "ExchangeLinkItem_pkey" PRIMARY KEY ("linkId", "videoId");

ALTER TABLE ONLY public."ExchangeLink"
    ADD CONSTRAINT "ExchangeLink_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ExchangeOfferItem"
    ADD CONSTRAINT "ExchangeOfferItem_pkey" PRIMARY KEY ("offerId", "videoId");

ALTER TABLE ONLY public."ExchangeOffer"
    ADD CONSTRAINT "ExchangeOffer_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Follow"
    ADD CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId", "followeeId");

ALTER TABLE ONLY public."FriendInvite"
    ADD CONSTRAINT "FriendInvite_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId", type);

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OAuthAccount"
    ADD CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Passkey"
    ADD CONSTRAINT "Passkey_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."RecoveryCode"
    ADD CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."RequestCooldown"
    ADD CONSTRAINT "RequestCooldown_pkey" PRIMARY KEY ("requesterId", "videoId");

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ShareLinkItem"
    ADD CONSTRAINT "ShareLinkItem_pkey" PRIMARY KEY ("linkId", "videoId");

ALTER TABLE ONLY public."ShareLink"
    ADD CONSTRAINT "ShareLink_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ShelfVisit"
    ADD CONSTRAINT "ShelfVisit_pkey" PRIMARY KEY ("visitorId", "ownerId");

ALTER TABLE ONLY public."SiteSetting"
    ADD CONSTRAINT "SiteSetting_pkey" PRIMARY KEY (key);

ALTER TABLE ONLY public."Subscription"
    ADD CONSTRAINT "Subscription_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SupportAttachment"
    ADD CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SupportMessage"
    ADD CONSTRAINT "SupportMessage_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SupportTicket"
    ADD CONSTRAINT "SupportTicket_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UploadSession"
    ADD CONSTRAINT "UploadSession_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."UsernameHistory"
    ADD CONSTRAINT "UsernameHistory_pkey" PRIMARY KEY (username);

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."VideoFrame"
    ADD CONSTRAINT "VideoFrame_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."VideoRequest"
    ADD CONSTRAINT "VideoRequest_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."VideoStack"
    ADD CONSTRAINT "VideoStack_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Video"
    ADD CONSTRAINT "Video_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX "AnonymousCode_linkId_videoId_key" ON public."AnonymousCode" USING btree ("linkId", "videoId");

CREATE INDEX "AnonymousCode_videoId_idx" ON public."AnonymousCode" USING btree ("videoId");

CREATE UNIQUE INDEX "AnonymousLink_code_key" ON public."AnonymousLink" USING btree (code);

CREATE INDEX "AnonymousLink_ownerId_idx" ON public."AnonymousLink" USING btree ("ownerId");

CREATE UNIQUE INDEX "AppToken_tokenHash_key" ON public."AppToken" USING btree ("tokenHash");

CREATE INDEX "AppToken_userId_idx" ON public."AppToken" USING btree ("userId");

CREATE INDEX "AuditLog_action_id_idx" ON public."AuditLog" USING btree (action, id);

CREATE INDEX "AuditLog_actorId_id_idx" ON public."AuditLog" USING btree ("actorId", id);

CREATE INDEX "AuditLog_targetType_targetId_idx" ON public."AuditLog" USING btree ("targetType", "targetId");

CREATE INDEX "BillingEvent_receivedAt_idx" ON public."BillingEvent" USING btree ("receivedAt");

CREATE INDEX "Block_blockedId_idx" ON public."Block" USING btree ("blockedId");

CREATE UNIQUE INDEX "BlockedFile_sha256_key" ON public."BlockedFile" USING btree (sha256);

CREATE UNIQUE INDEX "BlockedFile_videoId_key" ON public."BlockedFile" USING btree ("videoId");

CREATE UNIQUE INDEX "Category_id_ownerId_key" ON public."Category" USING btree (id, "ownerId");

CREATE UNIQUE INDEX "Category_ownerId_name_key" ON public."Category" USING btree ("ownerId", name);

CREATE INDEX "ConversationParticipant_userId_idx" ON public."ConversationParticipant" USING btree ("userId");

CREATE UNIQUE INDEX "Conversation_userAId_userBId_key" ON public."Conversation" USING btree ("userAId", "userBId");

CREATE INDEX "Conversation_userBId_idx" ON public."Conversation" USING btree ("userBId");

CREATE INDEX "DownloadEvent_userId_startedAt_idx" ON public."DownloadEvent" USING btree ("userId", "startedAt");

CREATE INDEX "DownloadEvent_userId_videoId_startedAt_idx" ON public."DownloadEvent" USING btree ("userId", "videoId", "startedAt");

CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON public."EmailToken" USING btree ("tokenHash");

CREATE INDEX "EmailToken_userId_type_idx" ON public."EmailToken" USING btree ("userId", type);

CREATE INDEX "ExchangeLinkItem_videoId_idx" ON public."ExchangeLinkItem" USING btree ("videoId");

CREATE UNIQUE INDEX "ExchangeLink_code_key" ON public."ExchangeLink" USING btree (code);

CREATE INDEX "ExchangeLink_ownerId_idx" ON public."ExchangeLink" USING btree ("ownerId");

CREATE INDEX "ExchangeOfferItem_videoId_idx" ON public."ExchangeOfferItem" USING btree ("videoId");

CREATE INDEX "ExchangeOffer_requestId_round_idx" ON public."ExchangeOffer" USING btree ("requestId", round);

CREATE INDEX "Follow_followeeId_createdAt_idx" ON public."Follow" USING btree ("followeeId", "createdAt");

CREATE INDEX "Follow_followerId_createdAt_idx" ON public."Follow" USING btree ("followerId", "createdAt");

CREATE UNIQUE INDEX "FriendInvite_code_key" ON public."FriendInvite" USING btree (code);

CREATE INDEX "FriendInvite_inviterId_createdAt_idx" ON public."FriendInvite" USING btree ("inviterId", "createdAt");

CREATE INDEX "Message_conversationId_id_idx" ON public."Message" USING btree ("conversationId", id);

CREATE INDEX "Notification_unread_requestId_idx" ON public."Notification" USING btree ("userId", ((payload ->> 'requestId'::text))) WHERE ("readAt" IS NULL);

CREATE INDEX "Notification_userId_id_idx" ON public."Notification" USING btree ("userId", id);

CREATE INDEX "Notification_userId_readAt_idx" ON public."Notification" USING btree ("userId", "readAt");

CREATE INDEX "Notification_userId_type_createdAt_idx" ON public."Notification" USING btree ("userId", type, "createdAt");

CREATE UNIQUE INDEX "OAuthAccount_provider_providerUserId_key" ON public."OAuthAccount" USING btree (provider, "providerUserId");

CREATE INDEX "OAuthAccount_userId_idx" ON public."OAuthAccount" USING btree ("userId");

CREATE INDEX "OutboxEvent_processedAt_id_idx" ON public."OutboxEvent" USING btree ("processedAt", id);

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON public."Passkey" USING btree ("credentialId");

CREATE INDEX "Passkey_userId_idx" ON public."Passkey" USING btree ("userId");

CREATE INDEX "RecoveryCode_userId_idx" ON public."RecoveryCode" USING btree ("userId");

CREATE UNIQUE INDEX "Report_open_once" ON public."Report" USING btree ("reporterId", "targetUserId", COALESCE("videoId", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = 'OPEN'::public."ReportStatus");

CREATE INDEX "Report_reporterId_idx" ON public."Report" USING btree ("reporterId");

CREATE INDEX "Report_status_id_idx" ON public."Report" USING btree (status, id);

CREATE INDEX "Report_targetUserId_idx" ON public."Report" USING btree ("targetUserId");

CREATE INDEX "Report_videoId_idx" ON public."Report" USING btree ("videoId");

CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON public."Session" USING btree ("refreshTokenHash");

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");

CREATE INDEX "ShareLinkItem_videoId_idx" ON public."ShareLinkItem" USING btree ("videoId");

CREATE UNIQUE INDEX "ShareLink_code_key" ON public."ShareLink" USING btree (code);

CREATE INDEX "ShareLink_expiresAt_idx" ON public."ShareLink" USING btree ("expiresAt");

CREATE INDEX "ShareLink_senderId_expiresAt_idx" ON public."ShareLink" USING btree ("senderId", "expiresAt");

CREATE INDEX "Subscription_userId_status_idx" ON public."Subscription" USING btree ("userId", status);

CREATE INDEX "SupportAttachment_messageId_idx" ON public."SupportAttachment" USING btree ("messageId");

CREATE INDEX "SupportMessage_ticketId_id_idx" ON public."SupportMessage" USING btree ("ticketId", id);

CREATE UNIQUE INDEX "SupportTicket_number_key" ON public."SupportTicket" USING btree (number);

CREATE INDEX "SupportTicket_status_statusAt_idx" ON public."SupportTicket" USING btree (status, "statusAt");

CREATE INDEX "SupportTicket_userId_activityAt_idx" ON public."SupportTicket" USING btree ("userId", "activityAt");

CREATE INDEX "UploadSession_status_expiresAt_idx" ON public."UploadSession" USING btree (status, "expiresAt");

CREATE INDEX "UploadSession_userId_appTokenId_createdAt_idx" ON public."UploadSession" USING btree ("userId", "appTokenId", "createdAt");

CREATE INDEX "UploadSession_userId_status_idx" ON public."UploadSession" USING btree ("userId", status);

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

CREATE UNIQUE INDEX "User_guestKeyHash_key" ON public."User" USING btree ("guestKeyHash");

CREATE INDEX "User_status_idx" ON public."User" USING btree (status);

CREATE INDEX "User_tierUntil_idx" ON public."User" USING btree ("tierUntil");

CREATE UNIQUE INDEX "User_username_key" ON public."User" USING btree (username);

CREATE INDEX "UsernameHistory_userId_idx" ON public."UsernameHistory" USING btree ("userId");

CREATE INDEX "VideoAccess_holderId_categoryId_idx" ON public."VideoAccess" USING btree ("holderId", "categoryId");

CREATE INDEX "VideoAccess_holderId_createdAt_id_idx" ON public."VideoAccess" USING btree ("holderId", "createdAt", id);

CREATE INDEX "VideoAccess_stackId_idx" ON public."VideoAccess" USING btree ("stackId");

CREATE UNIQUE INDEX "VideoAccess_videoId_holderId_key" ON public."VideoAccess" USING btree ("videoId", "holderId");

CREATE UNIQUE INDEX "VideoFrame_videoId_index_key" ON public."VideoFrame" USING btree ("videoId", index);

CREATE INDEX "VideoRequest_awaitingUserId_status_idx" ON public."VideoRequest" USING btree ("awaitingUserId", status);

CREATE INDEX "VideoRequest_holderId_status_idx" ON public."VideoRequest" USING btree ("holderId", status);

CREATE INDEX "VideoRequest_requesterId_status_idx" ON public."VideoRequest" USING btree ("requesterId", status);

CREATE INDEX "VideoRequest_status_expiresAt_idx" ON public."VideoRequest" USING btree (status, "expiresAt");

CREATE UNIQUE INDEX "VideoStack_id_ownerId_key" ON public."VideoStack" USING btree (id, "ownerId");

CREATE INDEX "VideoStack_ownerId_idx" ON public."VideoStack" USING btree ("ownerId");

CREATE INDEX "Video_authorId_readyAt_idx" ON public."Video" USING btree ("authorId", "readyAt");

CREATE INDEX "Video_authorId_status_idx" ON public."Video" USING btree ("authorId", status);

CREATE INDEX "Video_authorId_visibility_live_idx" ON public."Video" USING btree ("authorId", visibility) WHERE ("deletedAt" IS NULL);

CREATE UNIQUE INDEX "Video_code_key" ON public."Video" USING btree (code);

CREATE INDEX "Video_dealId_idx" ON public."Video" USING btree ("dealId");

CREATE INDEX "Video_deletedAt_idx" ON public."Video" USING btree ("deletedAt");

CREATE INDEX "Video_feed_idx" ON public."Video" USING btree ("authorId", "readyAt" DESC, id DESC) WHERE (("deletedAt" IS NULL) AND (status = 'READY'::public."VideoStatus"));

CREATE INDEX "Video_originalSha256_idx" ON public."Video" USING btree ("originalSha256");

ALTER TABLE ONLY public."AnonymousCode"
    ADD CONSTRAINT "AnonymousCode_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES public."AnonymousLink"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."AnonymousCode"
    ADD CONSTRAINT "AnonymousCode_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."AnonymousLink"
    ADD CONSTRAINT "AnonymousLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."AppToken"
    ADD CONSTRAINT "AppToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."BlockedFile"
    ADD CONSTRAINT "BlockedFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."BlockedFile"
    ADD CONSTRAINT "BlockedFile_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_coverVideoId_fkey" FOREIGN KEY ("coverVideoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."DownloadEvent"
    ADD CONSTRAINT "DownloadEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."DownloadEvent"
    ADD CONSTRAINT "DownloadEvent_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."EmailToken"
    ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeLinkItem"
    ADD CONSTRAINT "ExchangeLinkItem_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES public."ExchangeLink"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeLinkItem"
    ADD CONSTRAINT "ExchangeLinkItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeLink"
    ADD CONSTRAINT "ExchangeLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeOfferItem"
    ADD CONSTRAINT "ExchangeOfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES public."ExchangeOffer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeOfferItem"
    ADD CONSTRAINT "ExchangeOfferItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ExchangeOffer"
    ADD CONSTRAINT "ExchangeOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public."VideoRequest"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Follow"
    ADD CONSTRAINT "Follow_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Follow"
    ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."FriendInvite"
    ADD CONSTRAINT "FriendInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."OAuthAccount"
    ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Passkey"
    ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."RecoveryCode"
    ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ShareLinkItem"
    ADD CONSTRAINT "ShareLinkItem_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES public."ShareLink"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ShareLinkItem"
    ADD CONSTRAINT "ShareLinkItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ShareLink"
    ADD CONSTRAINT "ShareLink_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ShelfVisit"
    ADD CONSTRAINT "ShelfVisit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ShelfVisit"
    ADD CONSTRAINT "ShelfVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Subscription"
    ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SupportAttachment"
    ADD CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."SupportMessage"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SupportMessage"
    ADD CONSTRAINT "SupportMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SupportMessage"
    ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."SupportTicket"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SupportTicket"
    ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."SupportTicket"
    ADD CONSTRAINT "SupportTicket_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadSession"
    ADD CONSTRAINT "UploadSession_appTokenId_fkey" FOREIGN KEY ("appTokenId") REFERENCES public."AppToken"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UploadSession"
    ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pendingInviteId_fkey" FOREIGN KEY ("pendingInviteId") REFERENCES public."FriendInvite"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."UsernameHistory"
    ADD CONSTRAINT "UsernameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_anonymousLinkId_fkey" FOREIGN KEY ("anonymousLinkId") REFERENCES public."AnonymousLink"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_categoryId_holderId_fkey" FOREIGN KEY ("categoryId", "holderId") REFERENCES public."Category"(id, "ownerId");

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_stackId_holderId_fkey" FOREIGN KEY ("stackId", "holderId") REFERENCES public."VideoStack"(id, "ownerId");

ALTER TABLE ONLY public."VideoAccess"
    ADD CONSTRAINT "VideoAccess_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoFrame"
    ADD CONSTRAINT "VideoFrame_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoRequest"
    ADD CONSTRAINT "VideoRequest_anonymousLinkId_fkey" FOREIGN KEY ("anonymousLinkId") REFERENCES public."AnonymousLink"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."VideoRequest"
    ADD CONSTRAINT "VideoRequest_exchangeLinkId_fkey" FOREIGN KEY ("exchangeLinkId") REFERENCES public."ExchangeLink"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."VideoRequest"
    ADD CONSTRAINT "VideoRequest_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoRequest"
    ADD CONSTRAINT "VideoRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VideoStack"
    ADD CONSTRAINT "VideoStack_coverVideoId_fkey" FOREIGN KEY ("coverVideoId") REFERENCES public."Video"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."VideoStack"
    ADD CONSTRAINT "VideoStack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Video"
    ADD CONSTRAINT "Video_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Video"
    ADD CONSTRAINT "Video_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES public."VideoRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL;

