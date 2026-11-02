/**
 * Pill tabs: an outlined capsule, the active tab filled with ink. Shared by the
 * requests page and the friends lists so tabs look the same everywhere.
 */
export const TAB_LIST =
  'mb-7 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border-2 border-line bg-surface p-1';

export function tabClass(active: boolean): string {
  return (
    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ' +
    (active ? 'bg-inverse text-on-inverse' : 'text-muted hover:bg-surface-2 hover:text-text')
  );
}
