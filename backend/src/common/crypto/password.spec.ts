import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(
      true,
    );
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('never throws on malformed hashes', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
