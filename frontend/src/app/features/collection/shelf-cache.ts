import { Injectable } from '@angular/core';

import type { CollectionItemDto, CollectionSection, CollectionSummaryDto } from '../../api';

/**
 * A part of the visitor's shelf, loaded and paged on its own: a visibility section, a
 * category, or the one feed (the owner's grouping).
 */
export interface ShelfPart {
  key: string;
  /** A translation key for its heading, or the heading itself; neither for the one feed. */
  titleKey: string | null;
  title: string | null;
  section?: CollectionSection;
  categoryId?: string;
  flat?: boolean;
  /** Only its first rows and a link to the whole category; 0 or none = all of it. */
  rows?: number;
}

export interface SectionState {
  items: CollectionItemDto[];
  total: number;
  loading: boolean;
}

export type Sections = Record<string, SectionState>;

interface Entry {
  at: number;
  parts: ShelfPart[];
  sections: Sections;
  /** The tile sizes follow it: without it the mosaic draws nothing, and the page is too short to scroll. */
  summary: CollectionSummaryDto | null;
  scrollY: number;
}

/** How long a left shelf is kept for coming back to it. */
const KEEP_MS = 10 * 60_000;
const MAX_ENTRIES = 5;

/**
 * What a visitor's shelf showed when it was left for a video (the loaded pages, the scroll): back
 * on it, it opens as it was instead of from the top with one page. In memory only.
 */
@Injectable({ providedIn: 'root' })
export class ShelfCache {
  private readonly entries = new Map<string, Entry>();

  save(
    key: string,
    parts: ShelfPart[],
    sections: Sections,
    summary: CollectionSummaryDto | null,
    scrollY: number,
  ): void {
    this.entries.delete(key);
    this.entries.set(key, { at: Date.now(), parts, sections, summary, scrollY });
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }

  take(key: string): {
    parts: ShelfPart[];
    sections: Sections;
    summary: CollectionSummaryDto | null;
    scrollY: number;
  } | null {
    const e = this.entries.get(key);
    this.entries.delete(key);
    return e && Date.now() - e.at < KEEP_MS ? e : null;
  }
}
