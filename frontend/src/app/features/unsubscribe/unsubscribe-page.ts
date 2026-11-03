import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import {
  Api,
  type NotificationType,
  unsubscribeAgain,
  unsubscribeInfo,
  unsubscribeStop,
} from '../../api';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { AuthLayoutComponent } from '../auth/auth-layout';

/**
 * `/unsubscribe?t=…`, from a mail: one kind of email off or back on, without signing in.
 * It asks first and changes nothing on opening: mail scanners follow links.
 */
@Component({
  selector: 'app-unsubscribe-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    AuthLayoutComponent,
    AlertComponent,
    ButtonDirective,
    SpinnerComponent,
  ],
  template: `
    <app-auth-layout [title]="'unsubscribe.title' | transloco">
      @switch (state()) {
        @case ('loading') {
          <p class="flex justify-center py-6 text-muted"><app-spinner /></p>
        }
        @case ('invalid') {
          <app-alert kind="error" data-testid="unsubscribe-invalid">{{
            'unsubscribe.invalid' | transloco
          }}</app-alert>
        }
        @default {
          <p class="text-sm text-muted" data-testid="unsubscribe-state">
            {{ (state() === 'off' ? 'unsubscribe.off' : 'unsubscribe.ask') | transloco }}
          </p>
          <p class="mt-2 font-semibold" data-testid="unsubscribe-what">
            {{ 'notifications.types.' + type() | transloco }}
          </p>
          @if (state() === 'off') {
            <button
              type="button"
              appButton
              variant="secondary"
              class="mt-6 w-full"
              [disabled]="busy()"
              data-testid="unsubscribe-undo"
              (click)="set(true)"
            >
              {{ 'unsubscribe.undo' | transloco }}
            </button>
          } @else {
            <button
              type="button"
              appButton
              class="mt-6 w-full"
              [disabled]="busy()"
              data-testid="unsubscribe-stop"
              (click)="set(false)"
            >
              {{ 'unsubscribe.stop' | transloco }}
            </button>
          }
        }
      }
      @if (state() !== 'loading') {
        <a
          routerLink="/settings/notifications"
          class="mt-5 inline-block text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
        >
          {{ 'unsubscribe.manage' | transloco }}
        </a>
      }
    </app-auth-layout>
  `,
})
export class UnsubscribePage {
  private readonly api = inject(Api);

  /** The signed token from the mail. */
  readonly t = input<string>();
  protected readonly state = signal<'loading' | 'ask' | 'off' | 'invalid'>('loading');
  protected readonly type = signal<NotificationType | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => void this.load(this.t()));
  }

  private async load(t: string | undefined): Promise<void> {
    if (!t) return this.state.set('invalid');
    try {
      const info = await this.api.invoke(unsubscribeInfo, { t });
      this.type.set(info.type);
      this.state.set(info.email ? 'ask' : 'off');
    } catch {
      this.state.set('invalid');
    }
  }

  protected async set(on: boolean): Promise<void> {
    const t = this.t();
    if (!t || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(on ? unsubscribeAgain : unsubscribeStop, { t });
      this.state.set(on ? 'ask' : 'off');
    } catch {
      this.state.set('invalid');
    } finally {
      this.busy.set(false);
    }
  }
}
