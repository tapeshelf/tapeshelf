export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

/** Handles that would collide with routes or impersonate the service. */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'about',
  'api',
  'www',
  'mail',
  'static',
  'assets',
  'u',
  'v',
  'me',
  'user',
  'users',
  'video',
  'videos',
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'auth',
  'settings',
  'profile',
  'exchange',
  'requests',
  'messages',
  'friends',
  'notifications',
  'search',
  'upload',
  'terms',
  'privacy',
  'legal',
  'faq',
  'security',
  'contact',
  'blog',
  'pricing',
  'docs',
  'press',
  'status',
  'tapeshelf',
  'tapeshelf',
  'official',
  'moderator',
  'mod',
  'staff',
  'team',
  'null',
  'undefined',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export type UsernameProblem = 'invalid' | 'reserved' | null;

export function checkUsername(normalized: string): UsernameProblem {
  if (!USERNAME_PATTERN.test(normalized)) return 'invalid';
  if (RESERVED_USERNAMES.has(normalized)) return 'reserved';
  return null;
}
