import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ButtonDirective } from '../../shared/ui/button/button.directive';

export interface StackCategoryChoice {
  /** null = no category. */
  id: string | null;
  name: string;
}

export interface StackCategoryOptions {
  choices: StackCategoryChoice[];
  preselect: string | null;
}

/**
 * A stack keeps one category: when stacking would change or drop a video's
 * category, the user picks the category of the whole stack. Closes with the chosen id (null for
 * none) or undefined when cancelled.
 */
@Component({
  selector: 'app-stack-category-dialog',
  imports: [TranslocoPipe, ButtonDirective],
  template: `
    <div
      class="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-float"
      role="dialog"
      [attr.aria-label]="'stacks.category.title' | transloco"
      data-testid="stack-category-dialog"
    >
      <h2 class="text-base font-semibold">{{ 'stacks.category.title' | transloco }}</h2>
      <p class="mt-1 text-sm text-muted">{{ 'stacks.category.text' | transloco }}</p>
      <div class="mt-4 flex flex-col gap-1" role="radiogroup">
        @for (c of data.choices; track c.id ?? 'none') {
          <label
            class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-2"
            [class.bg-surface-2]="chosen() === c.id"
          >
            <input
              type="radio"
              name="stack-category"
              class="accent-accent"
              [checked]="chosen() === c.id"
              (change)="chosen.set(c.id)"
            />
            <span class="min-w-0 text-sm" [class.text-muted]="c.id === null">{{ c.name }}</span>
          </label>
        }
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(undefined)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="button"
          appButton
          cdkFocusInitial
          data-testid="stack-category-confirm"
          (click)="ref.close(chosen())"
        >
          {{ 'stacks.category.confirm' | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class StackCategoryDialog {
  protected readonly data = inject<StackCategoryOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string | null | undefined>>(DialogRef);
  protected readonly chosen = signal<string | null>(this.data.preselect);
}

@Injectable({ providedIn: 'root' })
export class StackCategoryPrompt {
  private readonly dialog = inject(Dialog);

  /** The chosen category id (null = none), or undefined when the user cancelled. */
  async ask(options: StackCategoryOptions): Promise<string | null | undefined> {
    const ref = this.dialog.open<string | null | undefined>(StackCategoryDialog, {
      data: options,
      backdropClass: 'vs-backdrop',
      autoFocus: '[cdkFocusInitial]',
    });
    return firstValueFrom(ref.closed);
  }
}
