/**
 * The side navigation of settings and the admin area: a quiet list, one item
 * style, the open item a soft pill. On narrow screens the navigation turns into a row that scrolls
 * sideways.
 */
export const SIDE_PANEL = '';
export const SIDE_NAV =
  'flex gap-1 overflow-x-auto md:sticky md:top-24 md:flex-col md:self-start md:overflow-visible ' +
  SIDE_PANEL;
export const SIDE_NAV_ITEM =
  'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap ' +
  'text-muted transition-colors hover:bg-surface-2 hover:text-text';
/** routerLinkActive classes; `!` wins over the hover colours above. */
export const SIDE_NAV_ACTIVE = 'bg-surface-2! font-semibold text-text!';
/** Two columns from md up: the panel and the page content. */
export const SIDE_LAYOUT = 'grid gap-6 md:grid-cols-[232px_minmax(0,1fr)] md:gap-10';
