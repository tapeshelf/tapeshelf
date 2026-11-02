import { DEFAULT_PAGE_SETTINGS, pageSettingsFrom } from './page-settings.js';

describe('pageSettingsFrom', () => {
  it('falls back to defaults for empty, null or malformed JSON', () => {
    expect(pageSettingsFrom({})).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(pageSettingsFrom(null)).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(pageSettingsFrom('grid')).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(
      pageSettingsFrom({ layout: 'table', tileSize: 7, sort: null }),
    ).toEqual(DEFAULT_PAGE_SETTINGS);
  });

  it('keeps valid values and ignores unknown keys', () => {
    expect(
      pageSettingsFrom({
        layout: 'list',
        tileSize: 'lg',
        sort: 'manual',
        showCover: true,
        firstView: 'folders',
        grouping: 'category',
        categoryRows: 0,
        tileScale: 'xl',
        extra: 1,
      }),
    ).toEqual({
      layout: 'list',
      tileSize: 'lg',
      sort: 'manual',
      showCover: true,
      firstView: 'folders',
      grouping: 'category',
      categoryRows: 0,
      tileScale: 'xl',
    });
    expect(pageSettingsFrom({ showCover: 'yes' }).showCover).toBe(false);
    // The first screen and the grouping: anything else is the default.
    expect(pageSettingsFrom({ firstView: 'cards', grouping: 'date' })).toEqual(
      DEFAULT_PAGE_SETTINGS,
    );
    // A category's rows and the tile size.
    expect(pageSettingsFrom({ categoryRows: 7, tileScale: 'huge' })).toEqual(
      DEFAULT_PAGE_SETTINGS,
    );
    expect(pageSettingsFrom({ categoryRows: 1.5 }).categoryRows).toBe(2);
  });
});
