import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  Api,
  type NotificationPreferenceDto,
  notificationsPreferences,
  notificationsUpdatePreferences,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { SiteConfig } from '../../core/site/site-config';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from './settings-section';

/** Settings → Notifications: the type × channel matrix. */
@Component({
  selector: 'app-notification-settings',
  imports: [SettingsSectionComponent, TranslocoPipe, ButtonDirective, SpinnerComponent],
  template: `
    <app-settings-section
      [title]="'settings.notifications.title' | transloco"
      [description]="
        (site.emailEnabled() ? 'settings.notifications.hint' : 'settings.notifications.hintNoEmail')
          | transloco
      "
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
  protected readonly dirty = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    void this.api
      .invoke(notificationsPreferences)
      .then((items) => this.items.set(items))
      .catch((e) => this.toast.error(toApiError(e).message || this.t.translate('errors.unknown')));
  }

  /** The name of an event; the one that speaks of email has a plain one where no mail goes out. */
  protected labelOf(type: NotificationPreferenceDto['type']): string {
    return type === 'NEW_MESSAGE' && !this.site.emailEnabled()
      ? 'settings.notifications.newMessageNoEmail'
      : `notifications.types.${type}`;
  }

  protected toggle(
    type: NotificationPreferenceDto['type'],
    channel: 'inApp' | 'email',
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
