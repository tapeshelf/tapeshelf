import { inject } from '@angular/core';
import { type RedirectFunction, Router, type UrlMatcher, UrlSegment } from '@angular/router';

import { panelOver } from './panels';

/**
 * User pages live under /@username: /@alice, /@alice/friends; a video opens at its
 * short code, /k3x9ab2. Build every link through these helpers. Someone known here by
 * their anonymous link goes by `~<code>` where a username would be: their page is
 * /p/<code>, and `~` alone means the link no longer opens.
 */
export function profileLink(username: string): string[] {
  return isAnonymous(username) ? ['/p', username.slice(1)] : [`/@${username}`];
}

/** `~<code>` or `~`: a person known only by their anonymous link. */
export function isAnonymous(username: string | null | undefined): boolean {
  return !!username?.startsWith('~');
}

/**
 * How a video's author or a page's owner is named in a byline: `@username`, or — known by an
 * anonymous link — the name they go by there, '' when none (show the word for "Anonymous").
 */
export function byline(u: { username: string; displayName: string }): string {
  return isAnonymous(u.username) ? u.displayName : `@${u.username}`;
}

/** The dictionary key for someone without a name: "Anonymous" by an anonymous link, else deleted. */
export function nameless(u: { username: string }): string {
  return isAnonymous(u.username) ? 'common.anonymous' : 'chat.deletedUser';
}

/** Someone's friends and followers: a panel over their shelf. */
export function friendsLink(username: string): unknown[] {
  return panelOver(username, 'friends', username);
}

/** The old /@username/friends page opens the same lists as a panel over that shelf. */
export function friendsIntoPanel(): RedirectFunction {
  return ({ params, queryParams }) =>
    inject(Router).createUrlTree(friendsLink(params['username']), { queryParams });
}

export function profileUrl(username: string): string {
  return `/@${username}`;
}

/** Short video codes: 7 characters without look-alikes, always with a digit (so never a page name). */
export const VIDEO_CODE = /^(?=[^\d]*\d)[2-9a-hjkmnp-z]{7}$/i;

export function videoLink(code: string): string[] {
  return [`/${code}`];
}

/**
 * Whose shelf a video was opened from. It travels in the navigation state, not the URL, so the link
 * stays short; a link opened from outside the app shows the viewer's own copy or the author's.
 */
export interface VideoNavState {
  holder?: string;
}

export function videoState(holder: string | null | undefined): VideoNavState {
  return holder ? { holder } : {};
}

export function holderOf(state: unknown): string | null {
  const holder = (state as VideoNavState | undefined)?.holder;
  return typeof holder === 'string' && holder ? holder : null;
}

/** /<code>: one segment that can only be a video code. */
export const videoCodeMatcher: UrlMatcher = (segments) =>
  segments.length === 1 && VIDEO_CODE.test(segments[0].path)
    ? { consumed: segments, posParams: { code: segments[0] } }
    : null;

/**
 * Router cannot express "@:username" as a path, so a matcher takes the first segment apart.
 * `rest` lists the following segments: literals match as is, ":name" captures a param.
 */
export function atUser(...rest: string[]): UrlMatcher {
  return (segments) => {
    const [first, ...tail] = segments;
    if (!first || tail.length !== rest.length) return null;
    const handle = /^@(\w+)$/.exec(first.path);
    if (!handle) return null;
    const posParams: Record<string, UrlSegment> = {
      username: new UrlSegment(handle[1], first.parameters),
    };
    for (const [i, part] of rest.entries()) {
      if (part.startsWith(':')) posParams[part.slice(1)] = tail[i];
      else if (part !== tail[i].path) return null;
    }
    return { consumed: segments, posParams };
  };
}

/** Old /u/... links (emails, shared URLs) keep working: same page under /@, query kept. */
export function fromLegacyUserPath(...rest: string[]): RedirectFunction {
  return ({ params, queryParams, fragment }) =>
    inject(Router).createUrlTree(
      [`/@${params['username']}`, ...rest.map((p) => (p.startsWith(':') ? params[p.slice(1)] : p))],
      { queryParams, fragment: fragment ?? undefined },
    );
}
