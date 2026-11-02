import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { Api, type ReportReason, type ReportTarget, reportsCreate } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';

export interface ReportTargetData {
  targetType: ReportTarget;
  targetId: string;
  /** Video title or person's name, for the dialog title. */
  name: string;
}

const REASONS: ReportReason[] = [
  'SPAM',
  'ILLEGAL',
  'COPYRIGHT',
  'ABUSE',
  'UNMARKED_ADULT',
  'OTHER',
];
export const REPORT_COMMENT_MAX = 1000;

/** "Report": a reason from the list plus a comment. */
@Component({
  selector: 'app-report-dialog',
  imports: [FormsModule, TranslocoPipe, ButtonDirective, InputDirective, FieldComponent],
  template: `
    <form
      class="w-[min(480px,calc(100vw-2rem))] rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'reports.title' | transloco"
      (ngSubmit)="send()"
      data-testid="report-dialog"
    >
      <h2 class="text-base font-semibold">
        {{
          (data.targetType === 'VIDEO' ? 'reports.titleVideo' : 'reports.titleUser')
            | transloco: { name: data.name }
        }}
      </h2>
      <p class="mt-1 text-sm text-muted">{{ 'reports.lead' | transloco }}</p>
      <fieldset class="mt-4 flex flex-col gap-1.5">
        <legend class="label-mono mb-1 text-muted">{{ 'reports.reasonLabel' | transloco }}</legend>
        @for (r of reasons; track r) {
          <label
            class="flex cursor-pointer items-center gap-2.5 rounded-md border-2 px-3 py-2 text-sm transition-colors"
            [class]="
              reason() === r ? 'border-line bg-shelf' : 'border-transparent hover:bg-surface-2'
            "
          >
            <input
              type="radio"
              name="reason"
              [value]="r"
              [checked]="reason() === r"
              (change)="reason.set(r)"
            />
            {{ 'reports.reason.' + r | transloco }}
          </label>
        }
      </fieldset>
      <app-field class="mt-4 block" optional [label]="'reports.comment' | transloco">
        <textarea
          appInput
          name="comment"
          rows="3"
          [maxlength]="max"
          [placeholder]="'reports.commentHint' | transloco"
          [(ngModel)]="comment"
          data-testid="report-comment"
        ></textarea>
      </app-field>
      @if (error(); as message) {
        <p class="mt-3 text-sm text-danger">{{ message }}</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton [disabled]="!reason() || busy()" data-testid="report-send">
          {{ 'reports.send' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class ReportDialogComponent {
  protected readonly data = inject<ReportTargetData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly reasons = REASONS;
  protected readonly max = REPORT_COMMENT_MAX;
  protected readonly reason = signal<ReportReason | null>(null);
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async send(): Promise<void> {
    const reason = this.reason();
    if (!reason || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.invoke(reportsCreate, {
        body: {
          targetType: this.data.targetType,
          targetId: this.data.targetId,
          reason,
          comment: this.comment().trim() || undefined,
        },
      });
      this.toast.success(this.t.translate(r.created ? 'reports.sent' : 'reports.already'));
      this.ref.close(true);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Opens the report dialog; guests go to sign in first and come back to the same page. */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  async open(data: ReportTargetData): Promise<void> {
    if (!this.auth.user()) {
      await this.router.navigate(['/login'], { queryParams: { returnTo: this.router.url } });
      return;
    }
    const ref = this.dialog.open<boolean>(ReportDialogComponent, {
      data,
      backdropClass: 'vs-backdrop',
    });
    await firstValueFrom(ref.closed);
  }
}
