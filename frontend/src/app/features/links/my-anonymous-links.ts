import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideSquareArrowOutUpRight, lucideVenetianMask } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { Api } from '../../api/api';
import { anonymousLinksCreate } from '../../api/fn/anonymous-links/anonymous-links-create';
import { anonymousLinksMine } from '../../api/fn/anonymous-links/anonymous-links-mine';
import { anonymousLinksRemove } from '../../api/fn/anonymous-links/anonymous-links-remove';
import type { MyAnonymousLinkDto } from '../../api/models/my-anonymous-link-dto';
import { errorText } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';

/** The longest note and name, as the server takes them. */
const NOTE_MAX = 100;
const NAME_MAX = 50;

/** Where an anonymous link opens. */
export function anonymousLinkUrl(code: string): string {
  return `${location.origin}/p/${code}`;
}

/**
 * "My links" → anonymous links to the shelf (Pro): whoever opens one sees the shelf
 * and may exchange, never learning the owner's nickname. Make one with a note for oneself (and a
 * name, when the display name gives the nickname away), copy it again, or delete it for good.
 */
@Component({
  selector: 'app-my-anonymous-links',
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    TranslocoPipe,
    AppDatePipe,
    ButtonDirective,
    InputDirective,
  ],
  providers: [provideIcons({ lucideCopy, lucideSquareArrowOutUpRight, lucideVenetianMask })],
  template: `
    <section class="mt-8" data-testid="anonymous-links">
      <h2 class="mb-1 text-base font-semibold">{{ 'links.anonymous.title' | transloco }}</h2>
      <p class="mb-4 text-sm text-muted">{{ 'links.anonymous.lead' | transloco }}</p>
      @if (pro()) {
        <!-- Pro's: Free in the cloud sees what it is and where to get it. -->
        <a
          class="flex items-center gap-2.5 text-sm font-medium hover:text-accent-text"
          [routerLink]="panelLink('pro')"
          [queryParamsHandling]="'merge'"
          data-testid="anonymous-link-pro"
        >
          <ng-icon name="lucideVenetianMask" size="15" class="text-muted" />{{
            'links.anonymous.create' | transloco
          }}
          <span
            class="label-mono shrink-0 rounded-full bg-inverse px-1.5 py-px text-[10px] font-semibold tracking-normal text-on-inverse"
            aria-hidden="true"
            >{{ 'common.tier.PREMIUM' | transloco }}</span
          >
        </a>
      } @else if (state(); as s) {
        <form
          class="mb-4 flex flex-col gap-2 rounded-lg border-2 border-border p-3"
          (ngSubmit)="create()"
          data-testid="anonymous-link-form"
        >
          <div class="flex flex-wrap gap-2">
            <input
              appInput
              type="text"
              name="note"
              class="min-w-[12rem] flex-1 text-sm"
              [maxlength]="noteMax"
              [placeholder]="'links.anonymous.notePlaceholder' | transloco"
              [attr.aria-label]="'links.anonymous.note' | transloco"
              [ngModel]="note()"
              (ngModelChange)="note.set($event)"
              data-testid="anonymous-link-note"
            />
            <input
              appInput
              type="text"
              name="name"
              class="min-w-[12rem] flex-1 text-sm"
              [maxlength]="nameMax"
              [required]="s.nameNeeded"
              [placeholder]="
                (s.nameNeeded ? 'links.anonymous.nameNeeded' : 'links.anonymous.namePlaceholder')
                  | transloco
              "
              [attr.aria-label]="'links.anonymous.name' | transloco"
              [ngModel]="name()"
              (ngModelChange)="name.set($event)"
              data-testid="anonymous-link-name"
            />
            <button
              type="submit"
              appButton
              [disabled]="busy() || (s.nameNeeded && !name().trim())"
              data-testid="anonymous-link-create"
            >
              <ng-icon name="lucideVenetianMask" size="16" />{{
                'links.anonymous.create' | transloco
              }}
            </button>
          </div>
          <p class="text-xs text-muted">
            {{
              (s.nameNeeded ? 'links.anonymous.nameNeededHint' : 'links.anonymous.nameHint')
                | transloco
            }}
          </p>
        </form>
        @if (s.links.length) {
          <ul class="flex flex-col gap-2" data-testid="my-anonymous-links">
            @for (link of s.links; track link.id) {
              <li
                class="flex flex-wrap items-center gap-3 rounded-lg border-2 border-border p-2.5"
                data-testid="my-anonymous-link"
              >
                <div class="min-w-[15rem] flex-1">
                  <p class="truncate text-sm font-semibold">
                    {{ link.note || ('links.anonymous.noNote' | transloco) }}
                  </p>
                  <p class="label-mono truncate text-muted">
                    {{
                      'links.anonymous.shownAs'
                        | transloco: { name: link.name || ('common.anonymous' | transloco) }
                    }}
                    · {{ link.createdAt | appDate: 'mediumDate' }}
                    @if (!link.works) {
                      · <span class="text-danger">{{ 'links.anonymous.paused' | transloco }}</span>
                    }
                  </p>
                </div>
                <div class="ml-auto flex shrink-0 gap-1">
                  <a
                    appButton
                    variant="ghost"
                    size="sm"
                    target="_blank"
                    rel="noopener"
                    [href]="url(link)"
                    [attr.aria-label]="'links.mine.open' | transloco"
                    [attr.title]="'links.mine.open' | transloco"
                    ><ng-icon name="lucideSquareArrowOutUpRight" size="15"
                  /></a>
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    size="sm"
                    data-testid="my-anonymous-link-copy"
                    (click)="copy(link)"
                  >
                    <ng-icon name="lucideCopy" size="14" />{{ 'links.dialog.copy' | transloco }}
                  </button>
                  <button
                    type="button"
                    appButton
                    variant="danger"
                    size="sm"
                    [disabled]="busy()"
                    data-testid="my-anonymous-link-delete"
                    (click)="remove(link)"
                  >
                    {{ 'links.anonymous.delete' | transloco }}
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class MyAnonymousLinks {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly site = inject(SiteConfig);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  protected readonly panelLink = panelLink;
  protected readonly noteMax = NOTE_MAX;
  protected readonly nameMax = NAME_MAX;
  protected readonly state = signal<{ links: MyAnonymousLinkDto[]; nameNeeded: boolean } | null>(
    null,
  );
  protected readonly note = signal('');
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  /** Free in the cloud: the section shows what Pro brings instead of the form. */
  protected readonly pro = computed(
    () => this.site.hasTiers() && !this.auth.user()?.canMakeAnonymousLinks,
  );
  protected readonly url = (link: MyAnonymousLinkDto) => anonymousLinkUrl(link.code);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.state.set(await this.api.invoke(anonymousLinksMine));
    } catch {
      this.state.set({ links: [], nameNeeded: false });
    }
  }

  /** Made, the link is copied at once: it is there to be sent. */
  protected async create(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const link = await this.api.invoke(anonymousLinksCreate, {
        body: { note: this.note().trim() || undefined, name: this.name().trim() || undefined },
      });
      this.state.update((s) => s && { ...s, links: [link, ...s.links] });
      this.note.set('');
      this.name.set('');
      await this.clipboard.copy(anonymousLinkUrl(link.code), 'links.anonymous.created');
    } catch (e) {
      this.toast.error(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(link: MyAnonymousLinkDto): Promise<void> {
    await this.clipboard.copy(anonymousLinkUrl(link.code), 'links.dialog.copied');
  }

  protected async remove(link: MyAnonymousLinkDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('links.anonymous.deleteTitle'),
      message: this.t.translate('links.anonymous.deleteText'),
      confirmLabel: this.t.translate('links.anonymous.delete'),
      danger: true,
    });
    if (!ok || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.invoke(anonymousLinksRemove, { id: link.id });
      this.state.update((s) => s && { ...s, links: s.links.filter((l) => l.id !== link.id) });
      this.toast.success(this.t.translate('links.anonymous.deleted'));
    } catch (e) {
      this.toast.error(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
