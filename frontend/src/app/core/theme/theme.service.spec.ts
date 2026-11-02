import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  function deviceIsDark(dark: boolean): void {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: dark && query === '(prefers-color-scheme: dark)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  }

  it('follows the device until a theme is picked, and writes data-theme on <html>', () => {
    deviceIsDark(true);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(TestBed.inject(DOCUMENT).documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('vs.theme')).toBeNull();
  });

  it('a light device gets the light theme', () => {
    deviceIsDark(false);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.resolved()).toBe('light');
  });

  it('toggles to dark, applies it and persists the choice', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    TestBed.tick();
    expect(service.resolved()).toBe('dark');
    expect(TestBed.inject(DOCUMENT).documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('vs.theme')).toBe('dark');
  });

  it('the switch changes the whole page at once: in one view transition, spreading from the switch', async () => {
    const doc = TestBed.inject(DOCUMENT);
    const root = doc.documentElement;
    let finish!: () => void;
    const animate = vi.fn();
    root.animate = animate as unknown as typeof root.animate;
    const start = vi.fn((apply: () => void) => {
      // Captured with transitions off and as one picture.
      expect(root.classList.contains('theme-switching')).toBe(true);
      expect(root.classList.contains('vt-theme')).toBe(true);
      apply();
      return {
        ready: Promise.resolve(),
        finished: new Promise<void>((resolve) => (finish = resolve)),
      };
    });
    (doc as unknown as { startViewTransition: unknown }).startViewTransition = start;
    const service = TestBed.inject(ThemeService);
    service.toggle({ x: 100, y: 40 });
    expect(start).toHaveBeenCalledOnce();
    expect(root.getAttribute('data-theme')).toBe('dark');
    await Promise.resolve();
    await Promise.resolve();
    expect(animate).toHaveBeenCalledWith(
      { clipPath: [expect.stringContaining('circle(0px at 100px 40px)'), expect.any(String)] },
      expect.objectContaining({ pseudoElement: '::view-transition-new(root)' }),
    );
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.classList.contains('vt-theme')).toBe(false);
    expect(root.classList.contains('theme-switching')).toBe(false);
    delete (doc as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it('without view transitions it still changes everything together, then lets transitions be', async () => {
    const doc = TestBed.inject(DOCUMENT);
    delete (doc as unknown as { startViewTransition?: unknown }).startViewTransition;
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(doc.documentElement.classList.contains('theme-switching')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(doc.documentElement.classList.contains('theme-switching')).toBe(false);
  });

  it('restores a stored preference', () => {
    localStorage.setItem('vs.theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('dark');
  });
});
