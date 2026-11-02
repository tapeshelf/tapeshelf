import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type BlockedUserDto, blocksList, blocksUnblock } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { UserRowComponent } from '../social/user-row';
import { SettingsSectionComponent } from './settings-section';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';

/** Settings → Blocked users: everyone I blocked, with unblock. */
@Component({
  selector: 'app-blocked-settings',
  imports: [
    EmptyStateComponent,
    SettingsSectionComponent,
    TranslocoPipe,
    AppDatePipe,
    ButtonDirective,
    SpinnerComponent,
    UserRowComponent,
  ],
  template: `
    <app-settings-section
      [title]="'settings.blocked.title' | transloco"
      [description]="'settings.blocked.hint' | transloco"
    >
      @if (!loaded()) {
        <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
      } @else if (items().length === 0) {
        <app-empty-state [text]="'settings.blocked.empty' | transloco" [seed]="29" />
      } @else {
        <ul
          class="flex flex-col divide-y divide-line/10 rounded-xl border-2 border-line bg-surface px-4"
          data-testid="blocked-list"
        >
          @for (b of items(); track b.user.id) {
            <li class="flex items-center gap-3 py-2">
              <app-user-row class="flex-1" [user]="b.user" />
              <span class="label-mono hidden text-muted sm:inline">{{
                b.createdAt | appDate: 'mediumDate'
              }}</span>
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="busy() === b.user.id"
                (click)="unblock(b)"
              >
                {{ 'social.unblock' | transloco }}
              </button>
            </li>
          }
        </ul>
      }
    </app-settings-section>
  `,
})
export class BlockedSettingsPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly items = signal<BlockedUserDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async unblock(b: BlockedUserDto): Promise<void> {
    this.busy.set(b.user.id);
    try {
      await this.api.invoke(blocksUnblock, { userId: b.user.id });
      this.items.update((list) => list.filter((x) => x.user.id !== b.user.id));
      this.toast.success(this.t.translate('social.toast.unblocked'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(null);
    }
  }

  private async load(): Promise<void> {
    try {
      this.items.set(await this.api.invoke(blocksList));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loaded.set(true);
    }
  }
}
