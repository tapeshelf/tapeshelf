import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type NotificationPreferenceDto,
  notificationsPreferences,
  notificationsUpdatePreferences,
  pushDevices,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { SiteConfig } from '../../core/site/site-config';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from './settings-section';

/**
 * Settings → Notifications: the type × channel matrix. The Push column is there
 * once a phone with the app is signed in to the account: without one it would switch
 * nothing.
 */
@Component({
  selector: 'app-notification-settings',
  imports: [SettingsSectionComponent, TranslocoPipe, ButtonDirective, SpinnerComponent],
  template: `
    <app-settings-section
      [title]="'settings.notifications.title' | transloco"
      [description]="hint() | transloco"
    >
      @if (items(); as items) {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs tracking-wide text-muted uppercase">
              <th class="py-2 font-medium">{{ 'settings.notifications.event' | transloco }}</th>
              <th class="w-24 py-2 text-center font-medium">
                {{ 'settings.notifications.inApp' | transloco }}
              </th>
              <!-- Where no mail goes out, a choice about it would change nothing. -->
              @if (site.emailEnabled()) {
                <th class="w-24 py-2 text-center font-medium">
                  {{ 'settings.notifications.email' | transloco }}
                </th>
              }
              @if (phone()) {
                <th class="w-24 py-2 text-center font-medium" data-testid="push-column">
                  {{ 'settings.notifications.push' | transloco }}
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (item of items; track item.type) {
              <tr class="border-t border-line/10">
                <td class="py-2.5">{{ labelOf(item.type) | transloco }}</td>
                <td class="py-2.5 text-center">
                  <input
                    type="checkbox"
                    [checked]="item.inApp"
                    [attr.aria-label]="
                      ('settings.notifications.inApp' | transloco) +
                      ': ' +
                      (labelOf(item.type) | transloco)
                    "
                    (change)="toggle(item.type, 'inApp', $event)"
                  />
                </td>
                @if (site.emailEnabled()) {
                  <td class="py-2.5 text-center">
                    <input
                      type="checkbox"
                      [checked]="item.email"
                      [attr.aria-label]="
                        ('settings.notifications.email' | transloco) +
                        ': ' +
                        ('notifications.types.' + item.type | transloco)
                      "
                      (change)="toggle(item.type, 'email', $event)"
                    />
                  </td>
                }
                @if (phone()) {
                  <td class="py-2.5 text-center">
                    <input
                      type="checkbox"
                      [checked]="item.push"
                      [attr.aria-label]="
                        ('settings.notifications.push' | transloco) +
                        ': ' +
                        (labelOf(item.type) | transloco)
                      "
                      (change)="toggle(item.type, 'push', $event)"
                    />
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        <div class="mt-5">
          <button type="button" appButton [disabled]="busy() || !dirty()" (click)="save()">
            {{ (busy() ? 'common.saving' : 'common.save') | transloco }}
          </button>
        </div>
      } @else {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      }
    </app-settings-section>
  `,
})
export class NotificationSettingsPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly site = inject(SiteConfig);

  protected readonly items = signal<NotificationPreferenceDto[] | null>(null);
  /** A phone with the app is signed in to the account. */
  protected readonly phone = signal(false);
  protected readonly hint = computed(() =>
    this.site.emailEnabled()
      ? this.phone()
        ? 'settings.notifications.hintPush'
        : 'settings.notifications.hint'
      : this.phone()
        ? 'settings.notifications.hintPushNoEmail'
        : 'settings.notifications.hintNoEmail',
  );
  protected readonly dirty = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    // Both before the matrix shows: a column appearing under the reader's eyes would move it.
    void Promise.all([
      this.api.invoke(notificationsPreferences),
      this.api.invoke(pushDevices).catch(() => []),
    ])
      .then(([items, devices]) => {
        this.phone.set(devices.length > 0);
        this.items.set(items);
      })
      .catch((e) => this.toast.error(toApiError(e).message || this.t.translate('errors.unknown')));
  }

  /**
   * The name of an event. The one that speaks of email has a plain one where no mail goes out, and
   * one that also says a message pushed to the phone is not mailed.
   */
  protected labelOf(type: NotificationPreferenceDto['type']): string {
    if (type !== 'NEW_MESSAGE') return `notifications.types.${type}`;
    if (!this.site.emailEnabled()) return 'settings.notifications.newMessageNoEmail';
    return this.phone()
      ? 'settings.notifications.newMessagePush'
      : 'notifications.types.NEW_MESSAGE';
  }

  protected toggle(
    type: NotificationPreferenceDto['type'],
    channel: 'inApp' | 'email' | 'push',
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.items.update((list) =>
      (list ?? []).map((i) => (i.type === type ? { ...i, [channel]: checked } : i)),
    );
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    const items = this.items();
    if (!items || this.busy()) return;
    this.busy.set(true);
    try {
      this.items.set(await this.api.invoke(notificationsUpdatePreferences, { body: { items } }));
      this.dirty.set(false);
      this.toast.success(this.t.translate('common.saved'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}
