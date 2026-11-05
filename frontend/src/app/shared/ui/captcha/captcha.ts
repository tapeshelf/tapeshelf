import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { ThemeService } from '../../../core/theme/theme.service';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      theme: 'light' | 'dark';
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(id: string): void;
  remove(id: string): void;
}

let loading: Promise<Turnstile> | null = null;

/** Loads Cloudflare's script once; it defines window.turnstile. */
function loadTurnstile(): Promise<Turnstile> {
  const ready = () => (window as unknown as { turnstile?: Turnstile }).turnstile;
  if (ready()) return Promise.resolve(ready()!);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () =>
      ready() ? resolve(ready()!) : reject(new Error('Turnstile not available')),
    );
    script.addEventListener('error', () => {
      loading = null;
      reject(new Error('Turnstile failed to load'));
    });
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile: shown on a repeated sign-up from the same IP. Emits a single-use
 * token; `reset()` asks for a fresh one after the token was spent on a failed attempt.
 */
@Component({
  selector: 'app-captcha',
  template: `<div #box class="min-h-16" data-testid="captcha"></div>`,
})
export class CaptchaComponent {
  readonly siteKey = input.required<string>();
  readonly token = output<string | null>();
  /** The script could not load (blocked or offline). */
  readonly failed = output<void>();
  /** The widget is on the page (its script came and drew it). */
  readonly shown = output<void>();
  /**
   * The widget gave up on a try: its frame did not load, or the check did not go through. It
   * tries again by itself; a page with nothing else to show may say so instead.
   */
  readonly broken = output<void>();

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly theme = inject(ThemeService);
  private api: Turnstile | null = null;
  private widget: string | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Gone before the script came: a widget rendered then sat in a detached box for good.
    let destroyed = false;
    afterNextRender(() => {
      loadTurnstile()
        .then((api) => {
          if (destroyed) return;
          this.api = api;
          this.widget = api.render(this.box().nativeElement, {
            sitekey: this.siteKey(),
            theme: this.theme.resolved(),
            language: document.documentElement.lang || 'en',
            callback: (token) => this.token.emit(token),
            'expired-callback': () => this.token.emit(null),
            'error-callback': () => {
              this.token.emit(null);
              this.broken.emit();
            },
          });
          this.shown.emit();
        })
        .catch(() => this.failed.emit());
    });
    destroyRef.onDestroy(() => {
      destroyed = true;
      if (this.api && this.widget) this.api.remove(this.widget);
    });
  }

  reset(): void {
    if (this.api && this.widget) this.api.reset(this.widget);
    this.token.emit(null);
  }
}
