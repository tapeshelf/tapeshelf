import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * How far the signature's timestamp may be from our clock. Paddle signs every delivery anew,
 * retries included, so a fresh one is always sent; a replay within the window changes nothing, as
 * events are deduplicated by id and applied by their own time.
 */
export const SIGNATURE_TOLERANCE_SEC = 300;

/**
 * Checks the `Paddle-Signature` header (`ts=<unix seconds>;h1=<hex>`, several h1 while a secret
 * rotates): HMAC-SHA256 of `<ts>:<raw body>` with the destination's secret.
 */
export function verifyPaddleSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!header) return false;
  const pairs = header.split(';').map((part) => {
    const at = part.indexOf('=');
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
  });
  const ts = pairs.find(([k]) => k === 'ts')?.[1];
  const signatures = pairs.filter(([k]) => k === 'h1').map(([, v]) => v);
  if (!ts || !/^\d{1,12}$/.test(ts) || !signatures.length) return false;
  if (Math.abs(now / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_SEC) return false;
  const expected = createHmac('sha256', secret)
    .update(`${ts}:`)
    .update(rawBody)
    .digest();
  return signatures.some((h1) => {
    if (!/^[0-9a-f]+$/i.test(h1)) return false;
    const given = Buffer.from(h1, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The header Paddle would send for this body (tests and local tools). */
export function signPaddle(
  rawBody: Buffer | string,
  secret: string,
  ts = Math.floor(Date.now() / 1000),
): string {
  const h1 = createHmac('sha256', secret)
    .update(`${ts}:`)
    .update(rawBody)
    .digest('hex');
  return `ts=${ts};h1=${h1}`;
}
