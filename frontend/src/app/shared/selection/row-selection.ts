import { computed, signal } from '@angular/core';

import {
  EMPTY_SELECTION,
  type SelectionState,
  applyClick,
  pruneSelection,
} from '../../features/library/selection';

/**
 * Ticked rows of a table or a list: a row's box ticks it, with Shift the whole
 * range from the row touched last; Ctrl/⌘ or Shift on the row itself does the same instead of
 * opening its link (as on the shelf). It holds the rows of one page: its owner clears it
 * when the page or the filters change.
 */
export class RowSelection {
  private readonly state = signal<SelectionState>(EMPTY_SELECTION);
  readonly ids = computed(() => this.state().selected);
  readonly count = computed(() => this.state().selected.size);
  readonly all = computed(() => {
    const order = this.order();
    return order.length > 0 && order.every((id) => this.state().selected.has(id));
  });
  readonly some = computed(() => this.count() > 0 && !this.all());

  constructor(private readonly order: () => readonly string[]) {}

  has(id: string): boolean {
    return this.state().selected.has(id);
  }

  /** A click on the row's box. The box shows the state, not the browser's own toggle. */
  box(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.tick(id, event.shiftKey);
  }

  /** A click anywhere on the row: with Ctrl/⌘ or Shift it ticks instead of following the link. */
  row(id: string, event: MouseEvent): void {
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) return;
    event.preventDefault();
    this.tick(id, event.shiftKey);
  }

  /** Shift-click must not select the text of the rows in between. */
  mousedown(event: MouseEvent): void {
    if (event.shiftKey) event.preventDefault();
  }

  toggleAll(on: boolean): void {
    this.state.set(on ? { selected: new Set(this.order()), anchor: null } : EMPTY_SELECTION);
  }

  clear(): void {
    this.state.set(EMPTY_SELECTION);
  }

  /** After a reload: rows no longer listed drop out. */
  prune(): void {
    this.state.update((s) => pruneSelection(s, this.order()));
  }

  private tick(id: string, shift: boolean): void {
    this.state.update((s) => applyClick(s, this.order(), id, { ctrl: true, shift }));
  }
}
