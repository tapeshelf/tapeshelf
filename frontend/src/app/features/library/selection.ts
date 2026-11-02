/** Explorer-like selection: click, Ctrl/Cmd-click toggles, Shift-click ranges. */
export interface ClickModifiers {
  ctrl: boolean;
  shift: boolean;
}

export interface SelectionState {
  selected: ReadonlySet<string>;
  /** Where the next Shift-click range starts. */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null };

export function applyClick(
  state: SelectionState,
  order: readonly string[],
  id: string,
  mods: ClickModifiers,
): SelectionState {
  if (mods.shift && state.anchor && order.includes(state.anchor)) {
    const a = order.indexOf(state.anchor);
    const b = order.indexOf(id);
    if (b < 0) return state;
    const [from, to] = a < b ? [a, b] : [b, a];
    const range = order.slice(from, to + 1);
    const selected = mods.ctrl ? new Set([...state.selected, ...range]) : new Set(range);
    return { selected, anchor: state.anchor };
  }
  if (mods.ctrl) {
    const selected = new Set(state.selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    return { selected, anchor: id };
  }
  return { selected: new Set([id]), anchor: id };
}

/** Right-click on an unselected tile selects only it; on a selected one keeps the selection. */
export function applyContextClick(state: SelectionState, id: string): SelectionState {
  return state.selected.has(id) ? state : { selected: new Set([id]), anchor: id };
}

export function selectAll(order: readonly string[]): SelectionState {
  return { selected: new Set(order), anchor: order[0] ?? null };
}

/** Keeps only ids that still exist (after deletions or a folder change). */
export function pruneSelection(state: SelectionState, order: readonly string[]): SelectionState {
  const alive = new Set(order);
  const selected = new Set([...state.selected].filter((id) => alive.has(id)));
  if (selected.size === state.selected.size) return state;
  return { selected, anchor: state.anchor && alive.has(state.anchor) ? state.anchor : null };
}

/** Which of the 16 frames to show for a pointer at `x` of `width` (hover scrub). */
export function scrubIndex(x: number, width: number, frames: number): number {
  if (frames <= 0 || !(width > 0)) return 0;
  return Math.min(frames - 1, Math.max(0, Math.floor((x / width) * frames)));
}

/**
 * Where a dragged group lands when dropped on `targetId`: the new full order of `order`
 * with the dragged ids removed and re-inserted before (or after) the target.
 */
export function moveBefore(
  order: readonly string[],
  dragged: readonly string[],
  targetId: string,
  after: boolean,
): string[] {
  const moving = new Set(dragged);
  if (moving.has(targetId)) return [...order];
  const rest = order.filter((id) => !moving.has(id));
  const at = rest.indexOf(targetId);
  if (at < 0) return [...order];
  const block = order.filter((id) => moving.has(id));
  rest.splice(after ? at + 1 : at, 0, ...block);
  return rest;
}
