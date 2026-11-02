/**
 * Short video codes, tapeshelf.com/<code>: 7 characters from an alphabet without
 * look-alikes, at least one of them a digit (the database draws them, see the video_code migration).
 */
export const VIDEO_CODE_PATTERN = /^(?=[^\d]*\d)[2-9a-hjkmnp-z]{7}$/;

/** A typed code may come in capitals; anything that cannot be a code is null. */
export function normalizeVideoCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  return VIDEO_CODE_PATTERN.test(code) ? code : null;
}
