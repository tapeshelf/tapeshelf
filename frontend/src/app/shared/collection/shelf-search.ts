import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';

import { InputDirective } from '../ui/field/input.directive';

/** How long typing pauses before the shelf asks the server. */
export const SEARCH_DEBOUNCE_MS = 250;

/** From how many videos a shelf shows its search field: a short one is seen at a glance. */
export const SEARCH_FROM = 10;

/**
 * Search by title within one shelf, the owner's and a visitor's: the text goes out
 * after a short pause; the cross or Esc clears it (Esc on an empty field is left to the page).
 * Quiet until used: a hairline frame like the zoom beside it, the full one while typing.
 */
@Component({
  selector: 'app-shelf-search',
  imports: [TranslocoPipe, NgIcon, InputDirective],
  providers: [provideIcons({ lucideSearch, lucideX })],
  template: `
    <div class="relative flex max-w-full items-center" role="search">
      <ng-icon
        name="lucideSearch"
        size="14"
        class="pointer-events-none absolute left-2.5 text-muted"
        aria-hidden="true"
      />
      <input
        #field
        appInput="sm"
        type="search"
        class="ts-search ts-quiet w-44 max-w-full pr-7 pl-8"
        [value]="text()"
        [placeholder]="'collection.search.placeholder' | transloco"
        [attr.aria-label]="'collection.search.label' | transloco"
        maxlength="100"
        data-testid="shelf-search"
        (input)="typed($any($event.target).value)"
        (keydown.escape)="clear($event)"
      />
      @if (text()) {
        <button
          type="button"
          class="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'collection.search.clear' | transloco"
          (click)="clear()"
        >
          <ng-icon name="lucideX" size="12" />
        </button>
      }
    </div>
  `,
})
export class ShelfSearchComponent {
  /** The search in effect (it lives in the address); typing changes it after a pause. */
  readonly value = input('');
  readonly searched = output<string>();
  /** Focused once shown (the compact bar opens it on demand). */
  readonly autofocus = input(false);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  protected readonly text = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // From outside (a reload, back, another folder): unless it is what is being typed already.
    effect(() => {
      const value = this.value();
      untracked(() => {
        if (this.text().trim() !== value) this.text.set(value);
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
    afterNextRender(() => {
      if (this.autofocus()) this.field()?.nativeElement.focus();
    });
  }

  protected typed(value: string): void {
    this.text.set(value);
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.searched.emit(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }

  protected clear(event?: Event): void {
    if (!this.text()) return;
    event?.stopPropagation();
    event?.preventDefault();
    this.stop();
    this.text.set('');
    this.searched.emit('');
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
