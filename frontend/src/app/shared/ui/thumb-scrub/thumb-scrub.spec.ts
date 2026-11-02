import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SensitiveContentService } from '../../../core/content/sensitive.service';
import { provideTranslocoTesting } from '../../../testing/transloco-testing';
import { ARM_DELAY_MS, ThumbScrubComponent } from './thumb-scrub';

const FRAMES = Array.from({ length: 16 }, (_, i) => `https://cdn/f${i}.webp`);

function move(el: HTMLElement, x: number): void {
  el.dispatchEvent(
    Object.assign(new MouseEvent('pointermove', { clientX: x, bubbles: true }), {
      pointerType: 'mouse',
    }),
  );
}

describe('ThumbScrubComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ThumbScrubComponent, provideTranslocoTesting()],
      providers: [{ provide: SensitiveContentService, useValue: { allowed: signal(true) } }],
    });
  });

  it('a pointer that only passes asks for no frames; one that rests asks for the frames it reaches', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(ThumbScrubComponent);
      fixture.componentRef.setInput('thumbnailUrl', 'https://cdn/cover.webp');
      fixture.componentRef.setInput('frameUrls', FRAMES);
      const el = fixture.nativeElement as HTMLElement;
      el.getBoundingClientRect = () => ({ left: 0, width: 160 }) as DOMRect;
      fixture.detectChanges();
      const frames = () => el.querySelectorAll('img[data-frame]').length;

      move(el, 5);
      el.dispatchEvent(new PointerEvent('pointerleave'));
      await vi.advanceTimersByTimeAsync(ARM_DELAY_MS * 2);
      fixture.detectChanges();
      expect(frames()).toBe(0);

      move(el, 5); // frame 0
      await vi.advanceTimersByTimeAsync(ARM_DELAY_MS + 10);
      fixture.detectChanges();
      expect(frames()).toBe(2); // 0 and its neighbour 1
      move(el, 85); // frame 8
      fixture.detectChanges();
      expect(frames()).toBe(5); // + 7, 8, 9

      // Leaving takes the frames out of the page.
      el.dispatchEvent(new PointerEvent('pointerleave'));
      fixture.detectChanges();
      expect(frames()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
