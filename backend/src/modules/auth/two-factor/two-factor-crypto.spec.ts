import {
  hashRecoveryCode,
  newRecoveryCode,
  normalizeRecoveryCode,
  seal,
  twoFactorKeys,
  unseal,
} from './two-factor-crypto.js';

const KEK = '11'.repeat(32);

/** The keys and codes of two-step sign-in. */
describe('two-factor crypto', () => {
  it('seals a secret so only the same KEK opens it, and any change is caught', () => {
    const { secret } = twoFactorKeys(KEK);
    const sealed = seal(secret, 'JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(seal(secret, 'JBSWY3DPEHPK3PXP')).not.toBe(sealed); // a fresh IV each time
    expect(unseal(secret, sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() =>
      unseal(twoFactorKeys('22'.repeat(32)).secret, sealed),
    ).toThrow();
    const [v, iv, tag, data] = sealed.split('.');
    const flipped = `${data![0] === 'A' ? 'B' : 'A'}${data!.slice(1)}`;
    expect(() => unseal(secret, [v, iv, tag, flipped].join('.'))).toThrow();
  });

  it('derives different keys for secrets and codes', () => {
    const keys = twoFactorKeys(KEK);
    expect(keys.secret.equals(keys.codes)).toBe(false);
  });

  it('makes codes without look-alikes and checks them however they are typed', () => {
    const codes = Array.from({ length: 200 }, newRecoveryCode);
    for (const c of codes)
      expect(c).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    expect(new Set(codes).size).toBe(200);
    const { codes: key } = twoFactorKeys(KEK);
    expect(normalizeRecoveryCode(' abcde fghjk ')).toBe('ABCDEFGHJK');
    expect(hashRecoveryCode(key, 'abcde-fghjk')).toBe(
      hashRecoveryCode(key, 'ABCDEFGHJK'),
    );
    expect(hashRecoveryCode(key, 'ABCDE-FGHJK')).not.toBe(
      hashRecoveryCode(twoFactorKeys('22'.repeat(32)).codes, 'ABCDE-FGHJK'),
    );
  });
});
