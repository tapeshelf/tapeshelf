import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { AutofocusDirective } from '../autofocus.directive';
import { ButtonDirective } from '../button/button.directive';
import { InputDirective } from '../field/input.directive';

export interface PromptOptions {
  /** Already translated. */
  title: string;
  message?: string;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  /** An answer is required (otherwise empty is fine). */
  required?: boolean;
  /** The answer must equal this (typed confirmation). */
  expect?: string;
  multiline?: boolean;
  maxLength?: number;
  /** For a single-line answer, e.g. a password. */
  inputType?: 'text' | 'password';
}

/** Confirmation with a text answer: a ban reason, a note, a typed username. */
@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule, TranslocoPipe, ButtonDirective, InputDirective, AutofocusDirective],
  template: `
    <form
      class="w-[min(460px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="data.title"
      (ngSubmit)="submit()"
    >
      <h2 class="text-base font-semibold">{{ data.title }}</h2>
      @if (data.message) {
        <p class="mt-2 text-sm text-muted">{{ data.message }}</p>
      }
      <div class="mt-4">
        <label for="prompt-answer" class="label-mono mb-1 block text-muted">{{ data.label }}</label>
        @if (data.multiline) {
          <textarea
            id="prompt-answer"
            appInput
            appAutofocus
            name="answer"
            rows="4"
            [maxlength]="data.maxLength ?? 1000"
            [(ngModel)]="value"
            data-testid="prompt-input"
          ></textarea>
        } @else {
          <input
            id="prompt-answer"
            appInput
            appAutofocus
            name="answer"
            [type]="data.inputType ?? 'text'"
            [attr.autocomplete]="data.inputType === 'password' ? 'current-password' : 'off'"
            [maxlength]="data.maxLength ?? 500"
            [(ngModel)]="value"
            data-testid="prompt-input"
          />
        }
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(null)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          appButton
          [variant]="data.danger ? 'danger' : 'primary'"
          [disabled]="!valid()"
          data-testid="prompt-confirm"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </form>
  `,
})
export class PromptDialogComponent {
  protected readonly data = inject<PromptOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string | null>>(DialogRef);
  protected readonly value = signal('');
  protected readonly valid = computed(() => {
    const v = this.value().trim();
    if (this.data.expect !== undefined) return v === this.data.expect;
    return !this.data.required || v.length > 0;
  });

  protected submit(): void {
    if (this.valid()) this.ref.close(this.value().trim());
  }
}

@Injectable({ providedIn: 'root' })
export class PromptService {
  private readonly dialog = inject(Dialog);

  /** The trimmed answer, or null when cancelled. */
  async prompt(options: PromptOptions): Promise<string | null> {
    const ref = this.dialog.open<string | null>(PromptDialogComponent, {
      data: options,
      backdropClass: 'vs-backdrop',
    });
    return (await firstValueFrom(ref.closed)) ?? null;
  }
}
