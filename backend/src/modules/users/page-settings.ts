/**
 * Owner-configurable look of the user page. Stored as JSON on
 * `User.pageSettings`; unknown or invalid values fall back to the defaults so old rows never break.
 */
export const PAGE_LAYOUTS = ['grid', 'list'] as const;
export const TILE_SIZES = ['sm', 'md', 'lg'] as const;
export const COLLECTION_SORTS = ['added', 'title', 'manual'] as const;
/** What a visitor sees first in "All videos": the videos, or the categories as cards. */
export const FIRST_VIEWS = ['videos', 'folders'] as const;
/** How "All videos" divides for visitors: by visibility (as before), by category, or not. */
export const SHELF_GROUPINGS = ['visibility', 'category', 'none'] as const;
/** The owner's size of the tiles: visitors' "smaller / bigger" go from it. */
export const TILE_SCALES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
/** Rows a category shows in "All videos" grouped by category; 0 = all of it. */
export const CATEGORY_ROWS_MAX = 6;

export type PageLayout = (typeof PAGE_LAYOUTS)[number];
export type TileSize = (typeof TILE_SIZES)[number];
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export type FirstView = (typeof FIRST_VIEWS)[number];
export type ShelfGrouping = (typeof SHELF_GROUPINGS)[number];
export type TileScale = (typeof TILE_SCALES)[number];

export interface PageSettings {
  layout: PageLayout;
  /** No longer used by the app: tiles size themselves by how many videos there are. */
  tileSize: TileSize;
  sort: CollectionSort;
  /** The coloured cover above the page; off unless the owner turns it on. */
  showCover: boolean;
  firstView: FirstView;
  grouping: ShelfGrouping;
  /** Each category's rows in "All videos" by category, unless the category has its own. */
  categoryRows: number;
  tileScale: TileScale;
}

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  layout: 'grid',
  tileSize: 'md',
  sort: 'added',
  showCover: false,
  firstView: 'videos',
  grouping: 'visibility',
  categoryRows: 2,
  tileScale: 'md',
};

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Normalizes whatever is stored in the JSON column. */
export function pageSettingsFrom(json: unknown): PageSettings {
  const raw =
    typeof json === 'object' && json !== null
      ? (json as Record<string, unknown>)
      : {};
  return {
    layout: pick(raw['layout'], PAGE_LAYOUTS, DEFAULT_PAGE_SETTINGS.layout),
    tileSize: pick(raw['tileSize'], TILE_SIZES, DEFAULT_PAGE_SETTINGS.tileSize),
    sort: pick(raw['sort'], COLLECTION_SORTS, DEFAULT_PAGE_SETTINGS.sort),
    showCover:
      typeof raw['showCover'] === 'boolean'
        ? raw['showCover']
        : DEFAULT_PAGE_SETTINGS.showCover,
    firstView: pick(
      raw['firstView'],
      FIRST_VIEWS,
      DEFAULT_PAGE_SETTINGS.firstView,
    ),
    grouping: pick(
      raw['grouping'],
      SHELF_GROUPINGS,
      DEFAULT_PAGE_SETTINGS.grouping,
    ),
    categoryRows:
      rows(raw['categoryRows']) ?? DEFAULT_PAGE_SETTINGS.categoryRows,
    tileScale: pick(
      raw['tileScale'],
      TILE_SCALES,
      DEFAULT_PAGE_SETTINGS.tileScale,
    ),
  };
}

/** A count of rows a category may show (0 = all), or null when it is not one. */
export function rows(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= CATEGORY_ROWS_MAX
    ? value
    : null;
}
