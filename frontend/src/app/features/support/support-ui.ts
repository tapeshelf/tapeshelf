import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, inject, input, model, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBug,
  lucideCircleHelp,
  lucideImagePlus,
  lucideLightbulb,
  lucideUserCog,
  lucideX,
} from '@ng-icons/lucide';

import type { SupportAttachmentDto, SupportStatus, SupportTopic } from '../../api';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';

/** The backend's limits (support.dto.ts): checked here first, so nothing large is sent in vain. */
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 5000;
export const SUPPORT_FILES_MAX = 5;
export const SUPPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const SUPPORT_TOPICS: SupportTopic[] = ['QUESTION', 'BUG', 'ACCOUNT', 'IDEA'];

export const TOPIC_ICON: Record<SupportTopic, string> = {
  QUESTION: 'lucideCircleHelp',
  BUG: 'lucideBug',
  ACCOUNT: 'lucideUserCog',
  IDEA: 'lucideLightbulb',
};

export const TOPIC_ICONS = {
  lucideBug,
  lucideCircleHelp,
  lucideLightbulb,
  lucideUserCog,
};

/**
 * A status as the author reads it, in the colours of the requests (exchange): their move is the
 * accent, solved is green, waiting for support or closed is quiet.
 */
export function supportStatusClass(status: SupportStatus): string {
  switch (status) {
    case 'WAITING':
      return 'bg-accent-soft text-accent-text';
    case 'RESOLVED':
      return 'bg-success/15 text-success';
    default:
      return 'bg-surface-2 text-muted';
  }
}

/** The account topic speaks of payment only where there are plans. */
export function topicKey(topic: SupportTopic, hasTiers: boolean): string {
  return topic === 'ACCOUNT' && !hasTiers
    ? 'support.topics.ACCOUNT_FREE'
    : `support.topics.${topic}`;
}

/**
 * What a bug report carries without asking ("always"): the browser, the screen and window,
 * language, theme and time zone, and the page under the panel. The server adds its version.
 */
export function techContext(
  page: string,
  theme: string,
  appLanguage: string,
): Record<string, string> {
  const nav = navigator as Navigator & {
    userAgentData?: {
      brands?: { brand: string; version: string }[];
      platform?: string;
      mobile?: boolean;
    };
  };
  const brand = nav.userAgentData?.brands?.find((b) => !/not.?a.?brand|chromium/i.test(b.brand));
  return {
    browser: brand ? `${brand.brand} ${brand.version}` : browserFromAgent(navigator.userAgent),
    os: nav.userAgentData?.platform || osFromAgent(navigator.userAgent),
    userAgent: navigator.userAgent,
    screen: `${screen.width}×${screen.height}`,
    window: `${window.innerWidth}×${window.innerHeight}`,
    pixelRatio: String(window.devicePixelRatio),
    language: navigator.language,
    appLanguage,
    theme,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    page,
  };
}

function browserFromAgent(ua: string): string {
  const m = /(Firefox|Edg|OPR|Chrome|Version)\/([\d.]+)/.exec(ua) ?? /(Safari)\/([\d.]+)/.exec(ua);
  if (!m) return 'unknown';
  const name = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]!] ?? m[1]!;
  return `${name} ${m[2]!.split('.')[0]}`;
}

function osFromAgent(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'unknown';
}

/**
 * Pictures to send with a message: picked, dropped or pasted (the composer passes paste and drop on
 * with `add`), shown as small previews that can be taken back. Five at most, 10 MB each, PNG, JPG
 * or WebP: anything else is refused here with a toast.
 */
@Component({
  selector: 'app-picture-picker',
  imports: [NgIcon, TranslocoPipe, ButtonDirective],
  providers: [provideIcons({ lucideImagePlus, lucideX })],
  template: `
    <div class="flex flex-wrap items-center gap-2">
      @for (p of previews(); track p.file) {
        <span
          class="relative h-14 w-14 overflow-hidden rounded-md border-2 border-line bg-surface-2"
        >
          <img [src]="p.url" alt="" class="h-full w-full object-cover" />
          <button
            type="button"
            class="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-inverse text-on-inverse"
            [attr.aria-label]="'support.picture.remove' | transloco"
            (click)="remove(p.file)"
          >
            <ng-icon name="lucideX" size="12" />
          </button>
        </span>
      }
      @if (files().length < max) {
        <label appButton variant="secondary" size="sm" class="cursor-pointer">
          <input
            type="file"
            class="hidden"
            multiple
            accept="image/png,image/jpeg,image/webp"
            data-testid="support-pictures"
            (change)="pick($event)"
          />
          <ng-icon name="lucideImagePlus" size="16" />{{ 'support.picture.add' | transloco }}
        </label>
      }
    </div>
  `,
})
export class PicturePickerComponent {
  readonly files = model<File[]>([]);
  protected readonly max = SUPPORT_FILES_MAX;
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly previews = signal<{ file: File; url: string }[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.previews().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  /** Adds what it can; says why the rest was left. */
  add(list: Iterable<File>): void {
    const next = [...this.files()];
    for (const file of list) {
      if (!PICTURE_TYPES.includes(file.type)) {
        this.toast.error(this.t.translate('support.picture.type'));
        continue;
      }
      if (file.size > SUPPORT_FILE_MAX_BYTES) {
        this.toast.error(this.t.translate('support.picture.size'));
        continue;
      }
      if (next.length >= SUPPORT_FILES_MAX) {
        this.toast.error(this.t.translate('support.picture.many', { count: SUPPORT_FILES_MAX }));
        break;
      }
      next.push(file);
      this.previews.update((list) => [...list, { file, url: URL.createObjectURL(file) }]);
    }
    this.files.set(next);
  }

  /** Called by the parent after sending: previews go with the files. */
  clear(): void {
    this.previews().forEach((p) => URL.revokeObjectURL(p.url));
    this.previews.set([]);
    this.files.set([]);
  }

  /** A paste with pictures in it adds them (a screenshot from the clipboard); text pastes as usual. */
  paste(e: ClipboardEvent): void {
    const pictures = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!pictures.length) return;
    e.preventDefault();
    this.add(pictures);
  }

  protected pick(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.add([...(input.files ?? [])]);
    input.value = '';
  }

  protected remove(file: File): void {
    const gone = this.previews().find((p) => p.file === file);
    if (gone) URL.revokeObjectURL(gone.url);
    this.previews.update((list) => list.filter((p) => p.file !== file));
    this.files.set(this.files().filter((f) => f !== file));
  }
}

/** The pictures of a message: small, a click shows one whole. */
@Component({
  selector: 'app-picture-strip',
  imports: [TranslocoPipe],
  host: { class: 'flex flex-wrap gap-2' },
  template: `
    @for (a of attachments(); track a.id) {
      <button
        type="button"
        class="block h-24 max-w-48 overflow-hidden rounded-md border-2 border-line bg-surface-2 focus-visible:ring-4 focus-visible:ring-accent/50 focus-visible:outline-none"
        [attr.aria-label]="'support.picture.open' | transloco"
        (click)="open(a)"
        data-testid="support-picture"
      >
        <img
          [src]="a.url"
          [attr.width]="a.width"
          [attr.height]="a.height"
          alt=""
          loading="lazy"
          class="h-full w-auto object-cover"
        />
      </button>
    }
  `,
})
export class PictureStripComponent {
  readonly attachments = input.required<SupportAttachmentDto[]>();
  private readonly dialog = inject(Dialog);

  protected open(a: SupportAttachmentDto): void {
    this.dialog.open(PictureLightboxComponent, {
      data: a,
      backdropClass: 'vs-backdrop',
      ariaLabel: a.id,
    });
  }
}

@Component({
  selector: 'app-picture-lightbox',
  imports: [NgIcon, TranslocoPipe],
  providers: [provideIcons({ lucideX })],
  host: { class: 'relative block' },
  template: `
    <img
      [src]="data.url"
      [attr.width]="data.width"
      [attr.height]="data.height"
      alt=""
      class="block h-auto max-h-[85dvh] w-auto max-w-[calc(100vw-2rem)] rounded-lg border-2 border-line bg-surface shadow-hard"
    />
    <button
      type="button"
      class="absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-line bg-surface text-text shadow-hard-sm hover:bg-surface-2"
      [attr.aria-label]="'common.close' | transloco"
      (click)="ref.close()"
    >
      <ng-icon name="lucideX" size="18" />
    </button>
  `,
})
export class PictureLightboxComponent {
  protected readonly data = inject<SupportAttachmentDto>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
}
