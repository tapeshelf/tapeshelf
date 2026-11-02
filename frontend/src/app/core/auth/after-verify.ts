/**
 * Where a sign-up began (a video someone wanted to request): the confirmation email opens a new
 * page, whose button leads back there instead of to the own page. Kept in this browser.
 */
const KEY = 'vs.afterVerify';

export function rememberAfterVerify(url: string): void {
  try {
    localStorage.setItem(KEY, url);
  } catch {
    /* private mode: the button leads to the own page */
  }
}

/** The place, once; null when there is none or it is not an address of this app. */
export function takeAfterVerify(): string | null {
  try {
    const url = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
  } catch {
    return null;
  }
}
