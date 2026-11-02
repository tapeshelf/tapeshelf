import { seededRandom, strokePath } from './stroke';

describe('brush stroke', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(strokePath(600, 14, 3)).toBe(strokePath(600, 14, 3));
    expect(strokePath(600, 14, 3)).not.toBe(strokePath(600, 14, 4));
  });

  it('stays inside its box', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const numbers = strokePath(800, 14, seed)
        .replace(/[MLCZ]/g, ' ')
        .trim()
        .split(/\s+/)
        .map(Number);
      const xs = numbers.filter((_, i) => i % 2 === 0);
      const ys = numbers.filter((_, i) => i % 2 === 1);
      // Bézier control points may overshoot a hair; the drawn curve stays well inside.
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-2);
      expect(Math.max(...xs)).toBeLessThanOrEqual(802);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...ys)).toBeLessThanOrEqual(15);
    }
  });

  it('draws nothing for an unmeasured box', () => {
    expect(strokePath(0, 14, 1)).toBe('');
  });

  it('spreads random numbers over [0, 1)', () => {
    const rand = seededRandom(7);
    const values = Array.from({ length: 1000 }, rand);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.reduce((a, b) => a + b, 0) / values.length).toBeCloseTo(0.5, 1);
  });
});
