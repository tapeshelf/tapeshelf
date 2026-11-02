/**
 * A local path to land on after a Google sign-in, or null for the user's own page: "/" is
 * tapeshelf.com's front page (the site), not somewhere a user who just signed in wants to be.
 */
export function safeReturnTo(value: unknown): string | null {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    value !== '/'
    ? value
    : null;
}
