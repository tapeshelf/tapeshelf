import {
  SIGNATURE_TOLERANCE_SEC,
  signPaddle,
  verifyPaddleSignature,
} from './paddle-signature.js';

const SECRET = 'pdl_ntfset_secret';
const BODY = Buffer.from('{"event_id":"evt_1","data":{"id":"sub_1"}}');
const NOW = Date.UTC(2026, 9, 14, 12);
const TS = NOW / 1000;

describe('Paddle signature', () => {
  it('accepts the HMAC of "<ts>:<raw body>" with the secret', () => {
    expect(
      verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, TS), SECRET, NOW),
    ).toBe(true);
  });

  it('accepts any of several h1 values (a secret being rotated)', () => {
    const good = signPaddle(BODY, SECRET, TS).split(';')[1];
    const header = `ts=${TS};h1=${'0'.repeat(64)};${good}`;
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW)).toBe(true);
  });

  it.each([
    ['another secret', signPaddle(BODY, 'other', TS)],
    ['a changed body', signPaddle(Buffer.from('{}'), SECRET, TS)],
    ['no header', undefined],
    ['no timestamp', `h1=${signPaddle(BODY, SECRET, TS).split('h1=')[1]}`],
    ['no signature', `ts=${TS}`],
    ['a non-hex signature', `ts=${TS};h1=zz`],
    ['a short signature', `ts=${TS};h1=abcd`],
  ])('refuses %s', (_case, header) => {
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it('refuses a timestamp too far from our clock, either way', () => {
    const old = TS - SIGNATURE_TOLERANCE_SEC - 1;
    const ahead = TS + SIGNATURE_TOLERANCE_SEC + 1;
    expect(
      verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, old), SECRET, NOW),
    ).toBe(false);
    expect(
      verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, ahead), SECRET, NOW),
    ).toBe(false);
    const edge = TS - SIGNATURE_TOLERANCE_SEC;
    expect(
      verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, edge), SECRET, NOW),
    ).toBe(true);
  });
});
