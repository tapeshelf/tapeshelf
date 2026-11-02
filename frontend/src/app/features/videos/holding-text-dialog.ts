import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, videosUpdateHolding } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { InputDirective } from '../../shared/ui/field/input.directive';

export interface HoldingTextDialogData {
  videoId: string;
  /** The holder's own name and description now (null: the author's are shown). */
  title: string | null;
  /** Not given (the library knows only the name): the dialog asks for the name alone. */
  description?: string | null;
  /** The author's, shown as placeholders. */
  originalTitle: string;
  originalDescription: string | null;
}

/** What the holder saved: their name and description, null where the author's are used again. */
export interface HoldingText {
  title: string | null;
  /** Absent when only the name was asked for. */
  description?: string | null;
}

/**
 * The holder's own name and description for someone else's video: seen only where
 * the video is part of their shelf. The video, its link and its author stay one; everywhere else,
 * in exchanges included, it goes by the author's name.
 */
@Component({
  selector: 'app-holding-text-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    AlertComponent,
    ButtonDirective,
    FieldComponent,
    InputDirective,
  ],
  template: `
    <form
      class="flex w-[min(560px,calc(100vw-2rem))] flex-col gap-4 rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'videos.own.title' | transloco"
      data-testid="holding-text-dialog"
      (ngSubmit)="save()"
    >
      <div>
        <h2 class="text-base font-semibold">{{ 'videos.own.title' | transloco }}</h2>
        <p class="mt-1 text-sm text-muted">{{ 'videos.own.lead' | transloco }}</p>
      </div>
      @if (error(); as message) {
        <app-alert kind="error">{{ message }}</app-alert>
      }
      <app-field optional [label]="'videos.own.name' | transloco">
        <input
          appInput
          type="text"
          name="title"
          maxlength="150"
          [(ngModel)]="title"
          [placeholder]="data.originalTitle"
          data-testid="own-title"
        />
      </app-field>
      @if (withDescription) {
        <app-field optional [label]="'videos.own.description' | transloco">
          <textarea
            appInput
            rows="4"
            name="description"
            maxlength="2000"
            [(ngModel)]="description"
            [placeholder]="data.originalDescription ?? ''"
            data-testid="own-description"
          ></textarea>
        </app-field>
      }
      <div class="flex flex-wrap items-center justify-end gap-2">
        @if (data.title !== null || (withDescription && data.description !== null)) {
          <button
            type="button"
            appButton
            variant="ghost"
            class="mr-auto"
            [disabled]="busy()"
            (click)="reset()"
          >
            {{ 'videos.own.reset' | transloco }}
          </button>
        }
        <button type="button" appButton variant="secondary" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton [disabled]="busy()" data-testid="own-save">
          {{ 'common.save' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class HoldingTextDialog {
  protected readonly ref = inject<DialogRef<HoldingText>>(DialogRef);
  protected readonly data = inject<HoldingTextDialogData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  protected readonly withDescription = this.data.description !== undefined;
  protected title = this.data.title ?? '';
  protected description = this.data.description ?? '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): Promise<void> {
    return this.send({
      title: this.title.trim() || null,
      ...(this.withDescription ? { description: this.description.trim() || null } : {}),
    });
  }

  protected reset(): Promise<void> {
    return this.send({ title: null, ...(this.withDescription ? { description: null } : {}) });
  }

  private async send(text: HoldingText): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(videosUpdateHolding, { id: this.data.videoId, body: text });
      this.ref.close(text);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}
