import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Locks requests for the rest of the transaction, in id order (every path takes them in that order,
 * so two never deadlock). The system closings — a block, a ban or an account deletion, a lost video —
 * read the requests after this and act on the ones still OPEN: before, they overwrote a request an
 * `accept` running at the same moment had just settled, and the holdings it granted stayed with a
 * request marked closed.
 */
export async function lockRequests(
  tx: Tx,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.$executeRaw`SELECT id FROM "VideoRequest" WHERE id = ANY(${[...ids]}::uuid[]) ORDER BY id FOR UPDATE`;
}

/** Postgres refused a lock at once (`NOWAIT`, SQLSTATE 55P03). */
export function isLockNotAvailable(err: unknown): boolean {
  const text = `${(err as Error)?.message ?? ''} ${JSON.stringify(err) ?? ''}`;
  return text.includes('55P03') || /could not obtain lock/i.test(text);
}

/** At most this many characters of a request's message go into its notification and email. */
const QUOTE_MAX = 140;

/** The start of a message for a notification: one line, cut with an ellipsis; null when empty. */
export function quoteOf(text: string | null | undefined): string | null {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > QUOTE_MAX
    ? `${flat.slice(0, QUOTE_MAX - 1).trimEnd()}…`
    : flat;
}
