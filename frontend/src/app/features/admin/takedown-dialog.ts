import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { type ReportReason } from '../../api';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

const RULES: ReportReason[] = ['SPAM', 'ILLEGAL', 'COPYRIGHT', 'ABUSE', 'UNMARKED_ADULT', 'OTHER'];

export interface TakedownOptions {
  /** Already translated. */
  title: string;
  /** Already translated: what else happens (holders, reports closed). */
  text: string;
  confirmLabel: string;
  /** Fixed by the report being resolved; otherwise the admin picks one. */
  rule?: ReportReason;
  /** Also ask for the internal note (report decisions). */
  withNote?: boolean;
  /** Pre-ticked "do not allow this file again" (removals on a report). */
  blockByDefault?: boolean;
}

export interface Takedown {
  rule: ReportReason;
  /** To the author; empty = none. */
  message: string;
  blockFile: boolean;
  note: string;
}

/**
 * An admin removal: the rule the author is told, the admin's words to them and
 * whether the file may come back; the author gets all of it as a notification and an email.
 */
@Component({
  selector: 'app-takedown-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    InputDirective,
    SelectComponent,
    OptionComponent,
  ],
  template: `
    <form
      class="flex w-[min(500px,calc(100vw-2rem))] flex-col gap-4 rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="data.title"
      (ngSubmit)="submit()"
      data-testid="takedown-dialog"
    >
      <div>
        <h2 class="text-base font-semibold">{{ data.title }}</h2>
        <p class="mt-2 text-sm text-muted">{{ data.text }}</p>
      </div>
      <div class="flex flex-col gap-1">
        <span class="label-mono text-muted">{{ 'admin.takedown.rule' | transloco }}</span>
        @if (data.rule) {
          <span class="text-sm" data-testid="takedown-rule-fixed">{{
            'reports.reason.' + data.rule | transloco
          }}</span>
        } @else {
          <app-select
            name="rule"
            [ariaLabel]="'admin.takedown.rule' | transloco"
            [ngModel]="rule()"
            (ngModelChange)="rule.set($event)"
            data-testid="takedown-rule"
          >
            @for (r of rules; track r) {
              <app-option [value]="r">{{ 'reports.reason.' + r | transloco }}</app-option>
            }
          </app-select>
        }
      </div>
      <label class="flex flex-col gap-1">
        <span class="label-mono text-muted">{{ 'admin.takedown.message' | transloco }}</span>
        <textarea
          appInput
          name="message"
          rows="3"
          maxlength="1000"
          [ngModel]="message()"
          (ngModelChange)="message.set($event)"
          data-testid="takedown-message"
        ></textarea>
        <span class="text-xs text-muted">{{ 'admin.takedown.messageHint' | transloco }}</span>
      </label>
      @if (data.withNote) {
        <label class="flex flex-col gap-1">
          <span class="label-mono text-muted">{{ 'admin.reports.note' | transloco }}</span>
          <textarea
            appInput
            name="note"
            rows="2"
            maxlength="1000"
            [ngModel]="note()"
            (ngModelChange)="note.set($event)"
          ></textarea>
        </label>
      }
      <label class="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="block"
          class="mt-0.5"
          [ngModel]="block()"
          (ngModelChange)="block.set($event)"
          data-testid="takedown-block"
        />
        <span>
          {{ 'admin.takedown.block' | transloco }}
          <span class="block text-xs text-muted">{{ 'admin.takedown.blockHint' | transloco }}</span>
        </span>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close(null)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton variant="danger" data-testid="takedown-confirm">
          {{ data.confirmLabel }}
        </button>
      </div>
    </form>
  `,
})
export class TakedownDialogComponent {
  protected readonly data = inject<TakedownOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<Takedown | null>>(DialogRef);
  protected readonly rules = RULES;
  protected readonly rule = signal<ReportReason>(this.data.rule ?? 'OTHER');
  protected readonly message = signal('');
  protected readonly note = signal('');
  protected readonly block = signal(this.data.blockByDefault ?? false);

  protected submit(): void {
    this.ref.close({
      rule: this.data.rule ?? this.rule(),
      message: this.message().trim(),
      blockFile: this.block(),
      note: this.note().trim(),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class TakedownService {
  private readonly dialog = inject(Dialog);

  /** What the admin decided, or null when cancelled. */
  async ask(options: TakedownOptions): Promise<Takedown | null> {
    const ref = this.dialog.open<Takedown | null>(TakedownDialogComponent, {
      data: options,
      backdropClass: 'vs-backdrop',
    });
    return (await firstValueFrom(ref.closed)) ?? null;
  }
}
