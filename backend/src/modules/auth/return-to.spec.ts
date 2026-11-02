import { safeReturnTo } from './return-to.js';

describe('safeReturnTo (after a Google sign-in)', () => {
  it('keeps a local path and sends everything else to the user’s own page (null)', () => {
    expect(safeReturnTo('/settings/plan?x=1')).toBe('/settings/plan?x=1');
    expect(safeReturnTo('/')).toBeNull(); // tapeshelf.com's front page is the site
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo('')).toBeNull();
    expect(safeReturnTo('//evil.example/x')).toBeNull();
    expect(safeReturnTo('https://evil.example/x')).toBeNull();
    expect(safeReturnTo(42)).toBeNull();
  });
});
