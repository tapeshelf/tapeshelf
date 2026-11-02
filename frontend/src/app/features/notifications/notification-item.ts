import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideCircleCheck,
  lucideCircleX,
  lucideMessageCircle,
  lucideShieldCheck,
  lucideTrash2,
  lucideUserPlus,
} from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { type NotificationDto } from '../../api';
import {
  describeNotification,
  type NotificationView,
} from '../../core/notifications/notification-text';

const ICONS = {
  ready: 'lucideCircleCheck',
  failed: 'lucideCircleX',
  removed: 'lucideTrash2',
  generic: 'lucideBell',
  social: 'lucideUserPlus',
  message: 'lucideMessageCircle',
  admin: 'lucideShieldCheck',
} as const;

/** One notification row (dropdown and page); the text comes from the type + payload. */
@Component({
  selector: 'app-notification-item',
  imports: [TranslocoPipe, AppDatePipe, NgIcon],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideCircleX,
      lucideTrash2,
      lucideBell,
      lucideUserPlus,
      lucideMessageCircle,
      lucideShieldCheck,
    }),
  ],
  host: { '[attr.data-unread]': 'item().readAt ? null : true' },
  template: `
    <div class="flex items-start gap-3 px-3" [class]="compact() ? 'py-2' : 'py-3'">
      <span
        class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        [class]="
          view().icon === 'failed'
            ? 'bg-danger/15 text-danger'
            : view().icon === 'ready'
              ? 'bg-success/15 text-success'
              : 'bg-surface-3 text-muted'
        "
      >
        <ng-icon [name]="iconName()" size="15" />
      </span>
      <span class="min-w-0 flex-1">
        <!-- A long comment or notice stays a few lines here; the page it opens has it all. -->
        <span
          class="line-clamp-4 text-sm"
          [class.font-medium]="!item().readAt"
          [class.text-muted]="!!item().readAt"
        >
          {{ view().key | transloco: params() }}
        </span>
        <span class="block text-xs text-faint">{{ item().createdAt | appDate: 'medium' }}</span>
      </span>
      @if (!item().readAt) {
        <span
          class="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
          [attr.aria-label]="'notifications.unread' | transloco"
        ></span>
      }
    </div>
  `,
})
export class NotificationItemComponent {
  readonly item = input.required<NotificationDto>();
  readonly compact = input(false, { transform: (v: unknown) => v !== false && v !== null });

  private readonly t = inject(TranslocoService);
  private readonly lang = toSignal(this.t.langChanges$);
  protected readonly view = computed(() => describeNotification(this.item()));
  /** Params that are dictionary keys themselves (a rule's name) are translated first. */
  protected readonly params = computed(() => {
    const view = this.view();
    this.lang();
    const params = { ...view.params };
    for (const name of view.keyParams ?? []) params[name] = this.t.translate(String(params[name]));
    return params;
  });
  protected readonly iconName = computed(() => ICONS[this.view().icon]);

  /** Where the item leads and with which query (null link: nowhere). */
  static targetOf(item: NotificationDto): Pick<NotificationView, 'link' | 'query'> {
    const { link, query } = describeNotification(item);
    return { link, query };
  }
}
