import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCopy,
  lucideDices,
  lucideLink2,
  lucideLockKeyhole,
  lucideMail,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api, type LinkTtl, type MyLinkDto, linksCreate } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { LanguageService } from '../../core/i18n/language.service';
import { panelLink } from '../../core/navigation/panels';
import { AuthStore } from '../../core/auth/auth.store';
import { SiteConfig } from '../../core/site/site-config';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import {
  DEFAULT_TTL,
  LINK_PASSWORD_MAX,
  LINK_PASSWORD_MIN,
  LINK_TTLS,
  type LinkCandidate,
  generatePassword,
  linkUrl,
} from './links';

export interface TemporaryLinkData {
  videos: LinkCandidate[];
  /** Picked but not for a link (bookmarks, unfinished): said once above the form. */
  skipped: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Pictures of the picked videos in the row on top. */
const SHOWN = 6;

/**
 * "Temporary link": the picked videos, how long the link works, a password
 * (typed or made up), one person's email; then the link to copy, with its password and its end.
 */
@Component({
  selector: 'app-temporary-link-dialog',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    ButtonDirective,
    InputDirective,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCopy,
      lucideDices,
      lucideLink2,
      lucideLockKeyhole,
      lucideMail,
    }),
  ],
  template: `
    <div
      class="flex max-h-[calc(100dvh-2rem)] w-[min(520px,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto rounded-lg border-2 border-line bg-surface p-5 shadow-hard"
      role="dialog"
      [attr.aria-label]="'links.dialog.title' | transloco"
      data-testid="link-dialog"
    >
      <div>
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <ng-icon name="lucideLink2" size="18" class="text-accent-text" />{{
            'links.dialog.title' | transloco
          }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ 'links.dialog.lead' | transloco: { count: data.videos.length } }}
        </p>
      </div>
      <div class="flex items-center gap-1.5" aria-hidden="true">
        @for (v of shown; track v.id) {
          <span
            class="h-11 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2"
          >
            @if (v.thumbnailUrl) {
              <img [src]="v.thumbnailUrl" alt="" class="h-full w-full object-cover" />
            }
          </span>
        }
        @if (more > 0) {
          <span class="label-mono px-1 text-muted">+{{ more }}</span>
        }
      </div>
      @if (data.skipped) {
        <p class="text-xs text-muted" data-testid="link-skipped">
          {{ 'links.dialog.skipped' | transloco: { count: data.skipped } }}
        </p>
      }

      @if (created(); as link) {
        <app-alert kind="success" data-testid="link-ready">{{
          'links.dialog.ready' | transloco: { date: link.expiresAt | appDate: 'd MMMM, HH:mm' }
        }}</app-alert>
        <div class="flex gap-2">
          <input
            appInput
            type="text"
            readonly
            class="min-w-0 flex-1 font-mono text-xs"
            [value]="url()"
            [attr.aria-label]="'links.dialog.title' | transloco"
            data-testid="link-url"
            (focus)="$any($event.target).select()"
          />
          <button type="button" appButton data-testid="link-copy" (click)="copy(url())">
            <ng-icon name="lucideCopy" size="16" />{{ 'links.dialog.copy' | transloco }}
          </button>
        </div>
        @if (shownPassword(); as pw) {
          <div class="flex flex-col gap-1.5">
            <span class="label-mono text-muted">{{
              'links.dialog.passwordLabel' | transloco
            }}</span>
            <div class="flex gap-2">
              <input
                appInput
                type="text"
                readonly
                class="min-w-0 flex-1 font-mono text-sm"
                [value]="pw"
                [attr.aria-label]="'links.dialog.passwordLabel' | transloco"
                data-testid="link-password-result"
                (focus)="$any($event.target).select()"
              />
              <button
                type="button"
                appButton
                variant="secondary"
                data-testid="link-copy-both"
                (click)="copy(withPassword())"
              >
                {{ 'links.dialog.copyBoth' | transloco }}
              </button>
            </div>
            <p class="text-xs text-muted">{{ 'links.dialog.passwordOnce' | transloco }}</p>
          </div>
        }
        @if (link.email) {
          <p class="flex items-center gap-2 text-sm text-muted" data-testid="link-mailed">
            <ng-icon name="lucideMail" size="16" class="shrink-0" />{{
              'links.dialog.mailed' | transloco: { email: link.email }
            }}
          </p>
        }
        <div class="flex flex-wrap items-center justify-between gap-2">
          <a
            appButton
            variant="ghost"
            size="sm"
            [routerLink]="panelLink('links')"
            [queryParamsHandling]="'merge'"
            data-testid="link-my-links"
            (click)="ref.close()"
            >{{ 'links.mine.title' | transloco }}</a
          >
          <button type="button" appButton variant="secondary" (click)="ref.close()">
            {{ 'common.close' | transloco }}
          </button>
        </div>
      } @else {
        <form class="flex flex-col gap-4" (ngSubmit)="create()">
          <fieldset>
            <legend class="label-mono mb-2 text-muted">{{ 'links.dialog.ttl' | transloco }}</legend>
            <div class="flex flex-wrap gap-1.5" role="radiogroup">
              @for (t of ttls; track t) {
                <button
                  type="button"
                  role="radio"
                  class="h-9 rounded-md border-2 px-3 text-sm font-semibold transition-colors"
                  [class]="
                    ttl() === t
                      ? 'border-line bg-inverse text-on-inverse'
                      : 'border-border text-text hover:border-line'
                  "
                  [attr.aria-checked]="ttl() === t"
                  [attr.data-testid]="'link-ttl-' + t"
                  (click)="ttl.set(t)"
                >
                  {{ 'links.ttl.' + t | transloco }}
                </button>
              }
            </div>
          </fieldset>

          <div class="flex flex-col gap-2">
            @if (passwordPro()) {
              <!-- A password is Pro's: Free in the cloud sees the option lead to Pro. -->
              <a
                class="flex items-center gap-2.5 text-sm font-medium hover:text-accent-text"
                [routerLink]="panelLink('pro')"
                [queryParamsHandling]="'merge'"
                (click)="ref.close()"
                data-testid="link-protect-pro"
              >
                <input type="checkbox" disabled tabindex="-1" aria-hidden="true" />
                <ng-icon name="lucideLockKeyhole" size="15" class="text-muted" />{{
                  'links.dialog.password' | transloco
                }}
                <span
                  class="label-mono shrink-0 rounded-full bg-inverse px-1.5 py-px text-[10px] font-semibold tracking-normal text-on-inverse"
                  aria-hidden="true"
                  >{{ 'common.tier.PREMIUM' | transloco }}</span
                >
              </a>
            } @else {
              <label class="flex items-center gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  name="protect"
                  [ngModel]="protect()"
                  (ngModelChange)="setProtect($event)"
                  data-testid="link-protect"
                />
                <ng-icon name="lucideLockKeyhole" size="15" class="text-muted" />{{
                  'links.dialog.password' | transloco
                }}
              </label>
            }
            @if (protect()) {
              <div class="flex gap-2 pl-6">
                <input
                  appInput
                  type="text"
                  name="password"
                  class="min-w-0 flex-1 font-mono text-sm"
                  autocomplete="off"
                  spellcheck="false"
                  [maxlength]="passwordMax"
                  [placeholder]="'links.dialog.passwordPlaceholder' | transloco"
                  [attr.aria-label]="'links.dialog.passwordPlaceholder' | transloco"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event)"
                  data-testid="link-password"
                />
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  data-testid="link-generate"
                  (click)="generateAndCopy()"
                >
                  <ng-icon name="lucideDices" size="16" />{{ 'links.dialog.generate' | transloco }}
                </button>
              </div>
              @if (copiedPassword() && password() === copiedPassword()) {
                <p
                  class="pl-6 text-xs text-success"
                  role="status"
                  data-testid="link-password-copied"
                >
                  {{ 'links.dialog.generatedCopied' | transloco }}
                </p>
              }
              @if (password() && password().length < passwordMin) {
                <p class="pl-6 text-xs text-danger">
                  {{ 'validation.minLength' | transloco: { n: passwordMin } }}
                </p>
              }
            }
          </div>

          <!-- It opens with a code sent by mail: not offered where no mail goes out. -->
          @if (site.emailEnabled()) {
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  name="forEmail"
                  [ngModel]="forEmail()"
                  (ngModelChange)="forEmail.set($event)"
                  data-testid="link-for-email"
                />
                <ng-icon name="lucideMail" size="15" class="text-muted" />{{
                  'links.dialog.forEmail' | transloco
                }}
              </label>
              @if (forEmail()) {
                <div class="flex flex-col gap-1.5 pl-6">
                  <input
                    appInput
                    type="email"
                    maxlength="254"
                    name="email"
                    autocomplete="off"
                    [placeholder]="'links.dialog.emailPlaceholder' | transloco"
                    [attr.aria-label]="'links.dialog.emailPlaceholder' | transloco"
                    [ngModel]="email()"
                    (ngModelChange)="email.set($event)"
                    data-testid="link-email"
                  />
                  <p class="text-xs text-muted">{{ 'links.dialog.emailHint' | transloco }}</p>
                </div>
              }
            </div>
          }

          @if (error(); as message) {
            <app-alert kind="error">{{ message }}</app-alert>
          }
          <div class="flex justify-end gap-2">
            <button type="button" appButton variant="ghost" (click)="ref.close()">
              {{ 'common.cancel' | transloco }}
            </button>
            <button
              type="submit"
              appButton
              [disabled]="busy() || !valid()"
              data-testid="link-create"
            >
              {{ 'links.dialog.create' | transloco }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class TemporaryLinkDialog {
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<TemporaryLinkData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly site = inject(SiteConfig);
  private readonly auth = inject(AuthStore);
  protected readonly panelLink = panelLink;
  protected readonly ttls = LINK_TTLS;
  protected readonly passwordMin = LINK_PASSWORD_MIN;
  protected readonly passwordMax = LINK_PASSWORD_MAX;
  protected readonly shown = this.data.videos.slice(0, SHOWN);
  protected readonly more = this.data.videos.length - SHOWN;

  /** Free in the cloud: a password leads to Pro. */
  protected readonly passwordPro = computed(
    () => this.site.hasTiers() && !this.auth.user()?.canProtectLinks,
  );
  protected readonly ttl = signal<LinkTtl>(DEFAULT_TTL);
  protected readonly protect = signal(false);
  protected readonly password = signal('');
  protected readonly forEmail = signal(false);
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<MyLinkDto | null>(null);
  /** The password as it was set: shown once, here (it is kept only as a hash). */
  protected readonly shownPassword = signal<string | null>(null);
  /** The last generated password, already on the clipboard. */
  protected readonly copiedPassword = signal<string | null>(null);

  protected readonly valid = computed(
    () =>
      (!this.protect() || this.password().trim().length >= LINK_PASSWORD_MIN) &&
      (!this.forEmail() || EMAIL.test(this.email().trim())),
  );
  protected readonly url = computed(() => {
    const link = this.created();
    return link ? linkUrl(link.code) : '';
  });
  protected readonly withPassword = computed(() => {
    this.language.loaded();
    return this.t.translate('links.dialog.shareText', {
      url: this.url(),
      password: this.shownPassword() ?? '',
    });
  });

  protected setProtect(on: boolean): void {
    this.protect.set(on);
  }

  /** A new password in the field and on the clipboard at once; the hint under it says so. */
  protected async generateAndCopy(): Promise<void> {
    const password = generatePassword();
    this.password.set(password);
    try {
      await navigator.clipboard.writeText(password);
      this.copiedPassword.set(password);
    } catch {
      this.copiedPassword.set(null);
    }
  }

  protected async create(): Promise<void> {
    if (this.busy() || !this.valid()) return;
    this.busy.set(true);
    this.error.set(null);
    const password = this.protect() ? this.password().trim() : undefined;
    try {
      const link = await this.api.invoke(linksCreate, {
        body: {
          videoIds: this.data.videos.map((v) => v.id),
          ttl: this.ttl(),
          ...(password ? { password } : {}),
          ...(this.forEmail() ? { email: this.email().trim() } : {}),
        },
      });
      this.shownPassword.set(password ?? null);
      this.created.set(link);
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(text: string): Promise<void> {
    await this.clipboard.copy(text, 'links.dialog.copied');
  }
}
