import {
  COVER_PALETTE,
  COVER_STYLES,
  coverDesign,
  coverSeed,
  defaultCoverColor,
  luminance,
} from './cover-lines';

describe('cover design', () => {
  it('is the same for the same user and differs between users', () => {
    expect(coverDesign('user-a', null)).toEqual(coverDesign('user-a', null));
    expect(coverDesign('user-a', null).lines).not.toEqual(coverDesign('user-b', null).lines);
  });

  it('draws a new pattern for a new pattern number, keeping the default colour', () => {
    const a = coverDesign(coverSeed('user-a', null), null, 'user-a');
    const b = coverDesign(coverSeed('user-a', 7), null, 'user-a');
    expect(b.lines).not.toEqual(a.lines);
    expect(b.color).toBe(a.color);
    expect(coverSeed('user-a', null)).toBe('user-a');
  });

  it('uses every style and lots of lines, a few of them in the accent colour', () => {
    const styles = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const d = coverDesign(`seed-${i}`, null);
      styles.add(d.style);
      expect(d.lines.length).toBeGreaterThanOrEqual(24);
      expect(d.lines.filter((l) => l.accent).length).toBeGreaterThan(0);
    }
    expect([...styles].sort()).toEqual([...COVER_STYLES].sort());
  });

  it('takes the owner colour, otherwise one from the palette', () => {
    expect(coverDesign('user-a', '#123456').color).toBe('#123456');
    expect(COVER_PALETTE).toContain(coverDesign('user-a', null).color);
    expect(coverDesign('user-a', null).color).toBe(defaultCoverColor('user-a'));
    expect(coverDesign('user-a', 'not a colour').color).toBe(defaultCoverColor('user-a'));
  });

  it('draws dark lines on light colours and light lines on dark ones', () => {
    expect(coverDesign('u', '#ffea00').ink).toBe('#171717');
    expect(coverDesign('u', '#1f3a5f').ink).toBe('#ffffff');
  });

  it('has ten distinct palette colours, all dark enough for light lines', () => {
    expect(new Set(COVER_PALETTE).size).toBe(10);
    for (const c of COVER_PALETTE) expect(luminance(c)).toBeLessThan(0.25);
  });
});
