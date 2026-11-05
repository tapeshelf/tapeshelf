-- What a native app says about itself when it signs in (X-Tapeshelf-Client); null for a browser.
ALTER TABLE "Session" ADD COLUMN "client" TEXT;
