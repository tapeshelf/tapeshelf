/**
 * How long a user's text may be: the same numbers the API checks, so a field stops the
 * typing instead of the server answering 400 after the fact.
 */
export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 2000;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 300;
export const EXCHANGE_PREFS_MAX = 200;
export const CATEGORY_NAME_MAX = 50;
export const STACK_NAME_MAX = 60;
export const REQUEST_MESSAGE_MAX = 1000;
export const CHAT_MESSAGE_MAX = 4000;
export const EMAIL_MAX = 254;
export const PASSWORD_MAX = 128;
export const SHELF_SEARCH_MAX = 100;

/**
 * A video's title from its file's name: never blank, never longer than a title may be, no emoji
 * cut in half.
 */
export function titleOr(title: string, fallback: string): string {
  const chars = Array.from(title.trim() || fallback.trim() || 'Video');
  return chars.slice(0, TITLE_MAX).join('').trim();
}
