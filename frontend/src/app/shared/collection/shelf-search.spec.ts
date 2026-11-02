import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideTranslocoTesting } from '../../testing/transloco-testing';
import { SEARCH_DEBOUNCE_MS, ShelfSearchComponent } from './shelf-search';

@Component({
  imports: [ShelfSearchComponent],
  template: `<app-shelf-search
    [value]="value()"
    (searched)="got.push($event); value.set($event)"
  />`,
})
class Host {
  readonly value = signal('');
  readonly got: string[] = [];
}

describe('ShelfSearchComponent', () => {
  it('searches after a pause, keeps what is typed, clears on Esc', async () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ imports: [Host, provideTranslocoTesting()] });
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
      const type = (text: string) => {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      };
      type('la');
      type('lake ');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);
      expect(fixture.componentInstance.got).toEqual([]);
      await vi.advanceTimersByTimeAsync(100);
      fixture.detectChanges();
      // One search for the pause, trimmed; the space typed stays in the field.
      expect(fixture.componentInstance.got).toEqual(['lake']);
      expect(input.value).toBe('lake ');
      // From outside (another address): the field follows.
      fixture.componentInstance.value.set('river');
      fixture.detectChanges();
      expect(input.value).toBe('river');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      input.dispatchEvent(esc);
      fixture.detectChanges();
      expect(fixture.componentInstance.got).toEqual(['lake', '']);
      expect(input.value).toBe('');
      // Esc on an empty field is the page's (it clears a selection there).
      const again = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(again);
      expect(again.defaultPrevented).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
