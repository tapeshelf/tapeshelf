import { Injectable } from '@angular/core';

import type { MosaicOptions, MosaicRow } from './mosaic-layout';

export interface DrawnLayout {
  keys: unknown[];
  aspects: readonly number[];
  options: MosaicOptions;
  /** May stop short of the keys: a last row held back for the next page. */
  rows: MosaicRow[];
}

/** As long as a shelf keeps what it loaded for "Back". */
const KEEP_MS = 10 * 60_000;
const KEEP_MAX = 30;

/**
 * The layouts the shelves drew last, by shelf: back on a shelf, its mosaic takes up the rows
 * it had — after "Load more" they were extended, not laid out anew, and laid out anew they would
 * break elsewhere, so the kept scroll position would land on other tiles.
 */
@Injectable({ providedIn: 'root' })
export class MosaicMemory {
  private readonly kept = new Map<string, { layout: DrawnLayout; at: number }>();

  get(key: string): DrawnLayout | null {
    const entry = this.kept.get(key);
    if (!entry || Date.now() - entry.at > KEEP_MS) return null;
    return entry.layout;
  }

  set(key: string, layout: DrawnLayout): void {
    this.kept.delete(key);
    this.kept.set(key, { layout, at: Date.now() });
    while (this.kept.size > KEEP_MAX) this.kept.delete(this.kept.keys().next().value!);
  }
}
