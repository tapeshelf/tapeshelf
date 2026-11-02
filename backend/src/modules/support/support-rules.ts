import type { SupportStatus } from '../../generated/prisma/enums.js';

const DAY = 24 * 60 * 60_000;
/** WAITING or RESOLVED with no word from the author this long: the ticket closes. */
export const SUPPORT_CLOSE_AFTER_DAYS = 7;

/**
 * A solved or closed ticket is over: nothing more is written in it; if the problem is still
 * there, the author opens a new one.
 */
export function isOver(status: SupportStatus): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}

/** The author writes: the ticket waits for support again. Null when it is over. */
export function afterAuthorMessage(status: SupportStatus): 'OPEN' | null {
  return isOver(status) ? null : 'OPEN';
}

/** Support answers: the ticket waits for its author, or is solved at once. */
export function afterSupportAnswer(resolve: boolean): SupportStatus {
  return resolve ? 'RESOLVED' : 'WAITING';
}

/** The author may say whether it helped once the ticket is over. */
export function canRate(status: SupportStatus): boolean {
  return isOver(status);
}

/** Tickets that began waiting for their author (or were solved) before this close now. */
export function closeBefore(now: Date): Date {
  return new Date(now.getTime() - SUPPORT_CLOSE_AFTER_DAYS * DAY);
}

/** Counts towards the limit of tickets at once: waiting for support or for the author. */
export const OPEN_STATUSES: SupportStatus[] = ['OPEN', 'WAITING'];
/** Solved and closed: over. */
export const OVER_STATUSES: SupportStatus[] = ['RESOLVED', 'CLOSED'];

/**
 * The browser's description of itself, as sent: a flat object of short strings, or null when it is
 * anything else. Kept only for bug reports.
 */
export function cleanContext(
  raw: string | undefined,
): Record<string, string> | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(
    0,
    24,
  )) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) continue;
    if (
      typeof v !== 'string' &&
      typeof v !== 'number' &&
      typeof v !== 'boolean'
    )
      continue;
    out[key] = String(v).slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

/** "#12", "12": a ticket number in an admin search. */
export function ticketNumber(q: string): number | null {
  const m = /^#?(\d{1,9})$/.exec(q.trim());
  return m ? Number(m[1]) : null;
}

/** The list cursor: the last ticket's activity and id. */
export function encodeCursor(activityAt: Date, id: string): string {
  return `${activityAt.toISOString()}_${id}`;
}

export function decodeCursor(
  cursor: string | undefined,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split('_');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id))
    return null;
  return { at, id };
}
