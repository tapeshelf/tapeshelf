import {
  type AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * A row of tabs whose type adapts to the room: it stays one line while that takes no
 * more than shrinking the type down to a still readable `minFontPx`; when even that does not fit, it
 * wraps — into as few lines as the readable sizes allow, at the largest size that keeps to them.
 * `--fit` scales the tabs (styles.css); `data-fit` is `one` (host and every `.fit-row-part` on one
 * line) or `wrap` (one flow over as many lines as it needs).
 */
@Directive({
  selector: '[appFitRow]',
  host: { class: 'fit-row' },
})
export class FitRowDirective implements AfterViewInit {
  /** The smallest the tabs' type (`.index-tab`) may get: below it reads poorly, px. */
  readonly minFontPx = input(14);
  /**
   * Below this window width (px) the row neither shrinks nor wraps: it scrolls sideways, the open
   * tab kept in view (`data-fit="scroll"`: a phone's categories took half its first screen).
   * 0 = never.
   */
  readonly scrollBelow = input(0);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame = 0;
  private lastWidth = -1;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.resize?.disconnect();
      this.mutations?.disconnect();
      document.fonts?.removeEventListener('loadingdone', this.onFonts);
    });
  }

  private resize: ResizeObserver | null = null;
  private mutations: MutationObserver | null = null;

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resize = new ResizeObserver(() => {
      // Only a new width matters: a height change is this row wrapping or unwrapping.
      if (this.el.clientWidth !== this.lastWidth) this.schedule();
    });
    this.resize.observe(this.el);
    this.mutations = new MutationObserver(() => this.schedule());
    this.mutations.observe(this.el, { childList: true, subtree: true, characterData: true });
    // The display face arriving after the first measure makes the same text wider.
    void document.fonts?.ready.then(() => this.schedule());
    document.fonts?.addEventListener('loadingdone', this.onFonts);
    this.schedule();
  }

  private readonly onFonts = () => this.schedule();

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.fit());
  }

  /** The largest readable size that keeps one line, else the fewest lines (see the class). */
  fit(): void {
    const el = this.el;
    this.lastWidth = el.clientWidth;
    if (this.scrollBelow() && window.innerWidth < this.scrollBelow()) {
      this.set('scroll', 1);
      this.showCurrent();
      return;
    }
    const tab = el.querySelector('.index-tab');
    this.set('one', 1);
    const base = tab ? parseFloat(getComputedStyle(tab).fontSize) : 16;
    const min = Math.min(1, this.minFontPx() / (base || 16));
    const over = () => el.scrollWidth > el.clientWidth + 1;
    if (!over()) return;
    this.set('one', min);
    if (!over()) {
      this.set(
        'one',
        this.largest(min, (scale) => (this.set('one', scale), !over())),
      );
      return;
    }
    this.set('wrap', min);
    const fewest = this.lines();
    this.set(
      'wrap',
      this.largest(min, (scale) => (this.set('wrap', scale), this.lines() <= fewest)),
    );
  }

  /** The open tab (`aria-current`) in view of a scrolling row, without moving the page. */
  private showCurrent(): void {
    const current = this.el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    const row = this.el.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    if (tab.left >= row.left && tab.right <= row.right) return;
    this.el.scrollLeft += tab.left - row.left - (row.width - tab.width) / 2;
  }

  private set(mode: 'one' | 'wrap' | 'scroll', scale: number): void {
    this.el.dataset['fit'] = mode;
    this.el.style.setProperty('--fit', scale.toFixed(3));
  }

  /** The largest scale in [min, 1] that passes `ok` (which holds at `min`), to a hundredth. */
  private largest(min: number, ok: (scale: number) => boolean): number {
    let lo = min;
    let hi = 1;
    if (ok(1)) return 1;
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Lines the tabs take: distinct bottoms of the row's items (rows align them at the bottom; a
   * part's items counted, not the part).
   */
  private lines(): number {
    const items = [...this.el.children].flatMap((c) =>
      c.classList.contains('fit-row-part') ? [...c.children] : [c],
    );
    const tops = new Set(
      items
        .filter((c) => (c as HTMLElement).offsetParent !== null)
        .map((c) => Math.round(c.getBoundingClientRect().bottom / 8)),
    );
    return tops.size;
  }
}
