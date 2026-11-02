/**
 * The commit this build was made from (CI passes the first 12 characters of the SHA, the same tag
 * the images carry in GHCR); "dev" outside an image. Shown in `X-Tapeshelf-Api` and /api/health.
 */
export const APP_VERSION = process.env['APP_VERSION'] || 'dev';
