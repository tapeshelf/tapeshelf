import { generatePassword, timeLeft } from './links';

describe('temporary links', () => {
  it('generates readable passwords in three groups of four', () => {
    const fixed = generatePassword((n) => Array.from({ length: n }, (_, i) => i * 7));
    expect(fixed).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(fixed).not.toMatch(/[ilo01]/);
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it('counts down in days and a clock, never below zero', () => {
    expect(timeLeft(((2 * 24 + 3) * 3600 + 14 * 60 + 9) * 1000 + 500)).toEqual({
      days: 2,
      clock: '03:14:09',
    });
    expect(timeLeft(59_000)).toEqual({ days: 0, clock: '00:00:59' });
    expect(timeLeft(-5000)).toEqual({ days: 0, clock: '00:00:00' });
  });
});
