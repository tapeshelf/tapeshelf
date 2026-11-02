import { Component, Injectable, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';

import {
  Api,
  type AdminBulkResultDto,
  type AdminVideoDetailDto,
  adminVideosDelete,
  adminVideosDeleteMany,
} from '../../api';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { apiMessage } from './admin-ui';
import { TakedownService } from './takedown-dialog';

/** What the actions need of a video row. */
export interface ActionVideo {
  id: string;
  title: string;
  holders: number;
  deletedAt: string | null;
}

/**
 * The admin's video tools in one place: the removal with a statement to the author. Each
 * resolves with the video as it is now, or null when the admin changed their mind or it failed (the
 * failure is shown).
 */
@Injectable({ providedIn: 'root' })
export class AdminVideoActions {
  private readonly api = inject(Api);
  private readonly t = inject(TranslocoService);
  private readonly takedown = inject(TakedownService);
  private readonly toast = inject(ToastService);

  async removeMany(videos: ActionVideo[]): Promise<boolean> {
    const live = videos.filter((v) => !v.deletedAt);
    if (!live.length) return false;
    const decision = await this.takedown.ask({
      title: this.t.translate('admin.bulk.toTrashTitle', { count: live.length }),
      text: this.t.translate('admin.bulk.toTrashText'),
      confirmLabel: this.t.translate('admin.videos.toTrash'),
    });
    if (!decision) return false;
    return this.report(
      () =>
        this.api.invoke(adminVideosDeleteMany, {
          body: {
            videoIds: live.map((v) => v.id),
            rule: decision.rule,
            message: decision.message || undefined,
            blockFile: decision.blockFile,
          },
        }),
      (r) => this.t.translate('admin.bulk.removed', { count: r.done }),
    );
  }

  /** Runs a bulk call and tells how it went: done, and what was skipped. */
  private async report(
    call: () => Promise<AdminBulkResultDto>,
    done: (r: AdminBulkResultDto) => string,
  ): Promise<boolean> {
    try {
      const r = await call();
      if (r.done) this.toast.success(done(r));
      if (r.skipped.length)
        this.toast.error(this.t.translate('admin.bulk.skipped', { count: r.skipped.length }));
      return r.done > 0;
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
      return false;
    }
  }

  async remove(video: ActionVideo): Promise<AdminVideoDetailDto | null> {
    const decision = await this.takedown.ask({
      title: this.t.translate('admin.videos.toTrashTitle', { title: video.title }),
      text: this.t.translate('admin.videos.toTrashText', { count: video.holders }),
      confirmLabel: this.t.translate('admin.videos.toTrash'),
    });
    if (!decision) return null;
    try {
      const done = await this.api.invoke(adminVideosDelete, {
        id: video.id,
        body: {
          rule: decision.rule,
          message: decision.message || undefined,
          blockFile: decision.blockFile,
        },
      });
      this.toast.success(this.t.translate('admin.done'));
      return done;
    } catch (e) {
      this.toast.error(apiMessage(e, this.t));
      return null;
    }
  }
}

/** The last column of the admin's video tables. */
@Component({
  selector: 'app-admin-video-actions',
  imports: [TranslocoPipe, NgIcon],
  providers: [
    provideIcons({
      lucideTrash2,
    }),
  ],
  host: { class: 'flex justify-end gap-1' },
  template: `
    @if (!video().deletedAt) {
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
        [attr.aria-label]="'admin.videos.toTrash' | transloco"
        [title]="'admin.videos.toTrash' | transloco"
        (click)="remove()"
        data-testid="video-action-delete"
      >
        <ng-icon name="lucideTrash2" size="16" />
      </button>
    }
  `,
})
export class AdminVideoActionsComponent {
  private readonly actions = inject(AdminVideoActions);

  readonly video = input.required<ActionVideo>();
  /** Something changed: the table reloads. */
  readonly changed = output<void>();

  protected async remove(): Promise<void> {
    if (await this.actions.remove(this.video())) this.changed.emit();
  }
}
