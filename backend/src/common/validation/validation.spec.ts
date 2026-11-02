import { isStrongEnough } from './password.js';
import { checkUsername, normalizeUsername } from './username.js';

describe('password policy', () => {
  it.each([
    ['secret123', true],
    ['пароль2024', true],
    ['onlyletters', false],
    ['12345678', false],
    ['ab1', false],
  ])('%s → %s', (pw, ok) => {
    expect(isStrongEnough(pw)).toBe(ok);
  });
});

describe('username rules', () => {
  it('normalizes and validates', () => {
    expect(normalizeUsername('  Ann_V ')).toBe('ann_v');
    expect(checkUsername('ann_v')).toBeNull();
    expect(checkUsername('ab')).toBe('invalid');
    expect(checkUsername('has-dash')).toBe('invalid');
    expect(checkUsername('admin')).toBe('reserved');
    expect(checkUsername('settings')).toBe('reserved');
  });
});
