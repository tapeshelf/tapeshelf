import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  type ElementRef,
  Injectable,
  type Signal,
  type TemplateRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayers, lucideUngroup, lucideX } from '@ng-icons/lucide';

/** What the page hands the window: live values, the tiles to draw, and what to do with its buttons. */
export interface StackSheetData {
  name: Signal<string | null>;
  size: Signal<number>;
  category: Signal<string | null>;
  owner: boolean;
  /** The tile the window grows out of: `[data-stack-id]` on the page. */
  fromStackId: string;
  /** A drag from inside hovers the dim: dropping takes the videos out. */
  dropOut: Signal<boolean>;
  /** The stack's videos, rendered by the page so its tiles, drag and selection work unchanged. */
  content: TemplateRef<unknown>;
  onClose: () => void;
  onRename?: (name: string) => void;
  onUnstack?: () => void;
}

/** The dim behind an open stack; a video dragged onto it leaves the stack (tile-drag looks for it). */
export const STACK_DIM_CLASS = 'vs-stack-dim';

/**
 * An open stack: a window over the page, grown out of the stack's tile, that holds
 * the stack's videos as one more shelf. The owner names the stack in its title, drags videos inside
 * to reorder them and out onto the dim around the window to take them out, or unstacks it; a visitor
 * just browses. A CDK dialog, so it sits above everything and keeps the focus.
 */
@Component({
  selector: 'app-stack-sheet',
  imports: [TranslocoPipe, NgIcon, NgTemplateOutlet],
  providers: [provideIcons({ lucideLayers, lucideUngroup, lucideX })],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @if (data.dropOut()) {
      <div class="pointer-events-none fixed inset-x-0 top-8 z-10 flex justify-center">
        <span
          class="rounded-full bg-inverse px-4 py-2 text-sm font-semibold text-on-inverse shadow-lg"
        >
          {{ 'stacks.dropOut' | transloco }}
        </span>
      </div>
    }
    <div
      #sheet
      class="flex max-h-[min(88vh,56rem)] w-[min(64rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-canvas shadow-[0_32px_80px_-24px_rgb(0_0_0/0.6)] outline-none"
      data-testid="stack-sheet"
    >
      <header class="flex items-start gap-4 px-6 pt-5 pb-3 sm:px-8">
        <div class="min-w-0 flex-1">
          @if (data.owner) {
            <input
              #nameInput
              type="text"
              maxlength="60"
              class="index-title -ml-1.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 outline-none transition-colors placeholder:text-faint hover:border-border focus:border-line"
              [value]="data.name() ?? ''"
              [placeholder]="'stacks.namePlaceholder' | transloco"
              [attr.aria-label]="'stacks.rename' | transloco"
              (change)="data.onRename?.(nameInput.value)"
              (keydown.enter)="nameInput.blur()"
              (keydown.escape)="revert(nameInput, $event)"
              data-testid="stack-name"
            />
          } @else {
            <h2 class="index-title">{{ data.name() || ('stacks.stack' | transloco) }}</h2>
          }
          <p class="label-mono mt-1 flex items-center gap-1.5 text-muted">
            <ng-icon name="lucideLayers" size="12" />
            {{ 'stacks.videos' | transloco: { count: data.size() } }}
            @if (data.category(); as c) {
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ c }}</span>
            }
          </p>
        </div>
        @if (data.owner) {
          <button
            type="button"
            class="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            data-testid="stack-unstack"
            (click)="data.onUnstack?.()"
          >
            <ng-icon name="lucideUngroup" size="14" />
            {{ 'stacks.unstack' | transloco }}
          </button>
        }
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'common.close' | transloco"
          data-testid="stack-close"
          (click)="data.onClose()"
        >
          <ng-icon name="lucideX" size="20" />
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 sm:px-8">
        <ng-container *ngTemplateOutlet="data.content" />
      </div>
      @if (data.owner) {
        <p class="label-mono border-t border-border px-6 py-3 text-faint sm:px-8">
          {{ 'stacks.sheetHint' | transloco }}
        </p>
      }
    </div>
  `,
})
export class StackSheetComponent {
  protected readonly data = inject<StackSheetData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly dialogs = inject(Dialog);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  constructor() {
    afterNextRender(() => this.grow());
  }

  /** Grows out of the stack's tile when it is on screen, else just appears. */
  private grow(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = this.sheet().nativeElement;
    const from = document.querySelector<HTMLElement>(
      `[data-stack-id="${CSS.escape(this.data.fromStackId)}"] [data-morph]`,
    );
    const to = el.getBoundingClientRect();
    const tile = from?.getBoundingClientRect();
    const origin = tile
      ? `${tile.left + tile.width / 2 - to.left}px ${tile.top + tile.height / 2 - to.top}px`
      : '50% 50%';
    const scale = tile ? Math.max(0.2, Math.min(0.6, tile.width / to.width)) : 0.92;
    el.animate(
      [
        { transformOrigin: origin, transform: `scale(${scale})`, opacity: 0 },
        { transformOrigin: origin, transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  protected revert(input: HTMLInputElement, e: Event): void {
    e.stopPropagation();
    input.value = this.data.name() ?? '';
    input.blur();
  }

  /** Esc closes the window when it is the topmost thing open and no field has the focus. */
  protected onEscape(e: Event): void {
    const target = e.target as HTMLElement | null;
    const open = this.dialogs.openDialogs;
    if (
      e.defaultPrevented ||
      open[open.length - 1] !== this.ref ||
      document.querySelector('.cdk-overlay-container [cdkmenu]') ||
      target?.closest('input, textarea, select, [contenteditable="true"], [cdkMenu]')
    )
      return;
    e.preventDefault();
    this.data.onClose();
  }
}

@Injectable({ providedIn: 'root' })
export class StackSheet {
  private readonly dialog = inject(Dialog);
  private readonly t = inject(TranslocoService);

  /** Opens the window; the page closes it through the returned ref when the stack leaves the address. */
  open(data: StackSheetData): DialogRef<void> {
    const ref = this.dialog.open<void>(StackSheetComponent, {
      data,
      hasBackdrop: true,
      backdropClass: ['vs-backdrop', STACK_DIM_CLASS],
      disableClose: true,
      autoFocus: 'dialog',
      ariaLabel: data.name() || this.t.translate('stacks.stack'),
    });
    ref.backdropClick.subscribe(() => data.onClose());
    return ref;
  }
}
