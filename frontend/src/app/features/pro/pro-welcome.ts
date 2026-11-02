import { DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBadgeCheck,
  lucideDownload,
  lucideEyeOff,
  lucideHardDrive,
  lucideLink2,
  lucideRotateCcw,
  lucideScissors,
  lucideUpload,
  lucideVenetianMask,
} from '@ng-icons/lucide';

import { SiteConfig } from '../../core/site/site-config';
import { formatBytes } from '../../shared/pipes/bytes.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';

interface Perk {
  icon: string;
  title: string;
  text: string;
  params?: Record<string, unknown>;
}

/**
 * Pro has just come on: what the account has now, from the limits this instance publishes.
 * Shown on the own shelf right after the payment; everything in it works at once.
 */
@Component({
  selector: 'app-pro-welcome',
  imports: [TranslocoPipe, NgIcon, ButtonDirective],
  providers: [
    provideIcons({
      lucideBadgeCheck,
      lucideDownload,
      lucideEyeOff,
      lucideHardDrive,
      lucideLink2,
      lucideRotateCcw,
      lucideScissors,
      lucideUpload,
      lucideVenetianMask,
    }),
  ],
  template: `
    <div
      class="w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-2 border-line bg-surface shadow-hard"
      role="dialog"
      aria-labelledby="pro-welcome-title"
      data-testid="pro-welcome"
    >
      <div class="relative overflow-hidden bg-accent px-6 pt-7 pb-6 text-accent-fg sm:px-8">
        <!-- A stamp, not a badge: the moment the plan came on. -->
        <span
          class="absolute top-5 right-5 rotate-6 rounded-md border-2 border-accent-fg px-2.5 py-1 font-display text-2xl font-black tracking-tight uppercase sm:top-6 sm:right-7 sm:text-3xl"
          aria-hidden="true"
          >{{ 'common.tier.PREMIUM' | transloco }}</span
        >
        <span
          class="pointer-events-none absolute -bottom-10 -left-8 h-40 w-40 rounded-full border-[18px] border-accent-fg/10"
          aria-hidden="true"
        ></span>
        <p class="label-mono text-accent-fg">{{ 'pro.welcome.kicker' | transloco }}</p>
        <h2
          id="pro-welcome-title"
          class="mt-2 max-w-[80%] font-display text-3xl leading-[1.05] font-bold tracking-tight sm:text-4xl"
        >
          {{ 'pro.welcome.title' | transloco }}
        </h2>
        <p class="mt-3 max-w-md text-[15px] leading-relaxed text-accent-fg">
          {{ 'pro.welcome.lead' | transloco }}
        </p>
      </div>
      <ul class="grid gap-x-6 gap-y-5 px-6 py-6 sm:grid-cols-2 sm:px-8">
        @for (perk of perks(); track perk.title) {
          <li class="flex gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"
            >
              <ng-icon [name]="perk.icon" size="17" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold">{{
                perk.title | transloco: perk.params
              }}</span>
              <span class="mt-0.5 block text-[13px] leading-snug text-muted">{{
                perk.text | transloco: perk.params
              }}</span>
            </span>
          </li>
        }
      </ul>
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t-2 border-line/10 px-6 py-4 sm:px-8"
      >
        <p class="text-xs text-muted">{{ 'pro.welcome.manage' | transloco }}</p>
        <button
          type="button"
          appButton
          (click)="ref.close()"
          data-testid="pro-welcome-close"
          cdkFocusInitial
        >
          {{ 'pro.welcome.start' | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class ProWelcomeDialog {
  protected readonly ref = inject(DialogRef);
  private readonly site = inject(SiteConfig);

  protected readonly perks = computed<Perk[]>(() => {
    const pro = this.site.plans().PREMIUM;
    const size = (bytes: number) => (bytes > 0 ? formatBytes(bytes) : null);
    const file = size(pro.maxFileBytes);
    const shelf = size(pro.storageQuotaBytes);
    return [
      file
        ? {
            icon: 'lucideUpload',
            title: 'pro.welcome.file',
            text: 'pro.welcome.fileText',
            params: { size: file },
          }
        : { icon: 'lucideUpload', title: 'pro.welcome.fileAny', text: 'pro.welcome.fileText' },
      shelf
        ? {
            icon: 'lucideHardDrive',
            title: 'pro.welcome.shelf',
            text: 'pro.welcome.shelfText',
            params: { size: shelf },
          }
        : { icon: 'lucideHardDrive', title: 'pro.welcome.shelfAny', text: 'pro.welcome.shelfText' },
      { icon: 'lucideDownload', title: 'pro.welcome.downloads', text: 'pro.welcome.downloadsText' },
      { icon: 'lucideScissors', title: 'pro.welcome.editor', text: 'pro.welcome.editorText' },
      {
        icon: 'lucideRotateCcw',
        title: 'pro.welcome.trash',
        text: 'pro.welcome.trashText',
        params: { count: pro.trashRetentionDays },
      },
      { icon: 'lucideEyeOff', title: 'pro.welcome.hidden', text: 'pro.welcome.hiddenText' },
      { icon: 'lucideLink2', title: 'pro.welcome.links', text: 'pro.welcome.linksText' },
      {
        icon: 'lucideVenetianMask',
        title: 'pro.welcome.anonymousLinks',
        text: 'pro.welcome.anonymousLinksText',
      },
      { icon: 'lucideBadgeCheck', title: 'pro.welcome.badge', text: 'pro.welcome.badgeText' },
    ];
  });
}
