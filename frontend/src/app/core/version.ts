// Set by `ng build --define` in the image (frontend/Dockerfile); absent in `ng serve` and tests.
declare const APP_VERSION: string | undefined;

/** The commit this build was made from (12 characters, the images' tag in GHCR), "dev" otherwise. */
export const WEB_VERSION = typeof APP_VERSION === 'string' ? APP_VERSION : 'dev';
