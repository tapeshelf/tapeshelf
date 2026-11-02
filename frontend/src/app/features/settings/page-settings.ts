import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShuffle } from '@ng-icons/lucide';

import {
  Api,
  type CollectionSort,
  type FirstView,
  type MeDto,
  type ShelfGrouping,
  type TileScale,
  type PageLayout,
  usersRemoveAvatar,
  usersRemoveCover,
  usersSetAvatar,
  usersSetCover,
  usersUpdatePageSettings,
  usersUpdateProfile,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { panelLink } from '../../core/navigation/panels';
import { SiteConfig } from '../../core/site/site-config';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { CoverComponent } from '../../shared/ui/cover/cover';
import { COVER_PALETTE, defaultCoverColor } from '../../shared/ui/cover/cover-lines';
import { FieldComponent } from '../../shared/ui/field/field';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { SettingsSectionComponent } from './settings-section';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { TILE_SCALES } from '../../shared/collection/shelf-zoom';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Settings → My page: avatar, cover (own picture, or the drawn cover in a colour from the palette
 * or one's own, with a pattern that can be redrawn) and the default look of the page.
 */
@Component({
  selector: 'app-page-settings',
  imports: [
    SelectComponent,
    OptionComponent,
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    FieldComponent,
    CoverComponent,
    SettingsSectionComponent,
    NgIcon,
    RouterLink,
  ],
  providers: [provideIcons({ lucideShuffle })],
  template: `
    @if (auth.user(); as me) {
      <app-settings-section
        [title]="'settings.page.avatar' | transloco"
        [description]="'settings.page.avatarHint' | transloco"
      >
        <div class="flex items-center gap-5">
          <div
            class="flex h-24 w-24 shrink-0 -rotate-2 items-center justify-center overflow-hidden rounded-xl border-[3px] border-accent-edge bg-accent font-display text-3xl font-bold text-accent-fg shadow-hard-sm"
          >
            @if (me.avatarUrl) {
              <img
                [src]="me.avatarUrl"
                alt=""
                class="h-full w-full object-cover"
                data-testid="avatar-preview"
              />
            } @else {
              {{ me.displayName.trim().slice(0, 1).toUpperCase() }}
            }
          </div>
          <div class="flex flex-wrap gap-2">
            <label appButton variant="secondary" size="sm" class="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                class="hidden"
                data-testid="avatar-input"
                (change)="upload('avatar', $event)"
              />
              {{ 'settings.page.choose' | transloco }}
            </label>
            @if (me.avatarUrl) {
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                [disabled]="busy()"
                (click)="remove('avatar')"
              >
                {{ 'settings.page.remove' | transloco }}
              </button>
            }
          </div>
        </div>
      </app-settings-section>

      <app-settings-section
        [title]="'settings.page.cover' | transloco"
        [description]="'settings.page.coverHint' | transloco"
      >
        <label class="mb-4 flex items-center gap-2.5 text-sm font-medium">
          <input
            type="checkbox"
            [ngModel]="me.pageSettings.showCover"
            (ngModelChange)="save({ showCover: $event })"
            data-testid="show-cover"
          />
          {{ 'settings.page.showCover' | transloco }}
        </label>
        <div
          class="relative aspect-[16/5] overflow-hidden rounded-xl border-2 border-line bg-surface-2 shadow-hard-sm"
          [class.opacity-50]="!me.pageSettings.showCover"
        >
          @if (me.coverUrl) {
            <img
              [src]="me.coverUrl"
              alt=""
              class="h-full w-full object-cover"
              data-testid="cover-preview"
            />
          } @else {
            <app-cover
              [seed]="me.id"
              [pattern]="me.coverPattern"
              [color]="coverColor()"
              data-testid="cover-generated"
            />
          }
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex flex-wrap gap-2">
            <label appButton variant="secondary" size="sm" class="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                class="hidden"
                data-testid="cover-input"
                (change)="upload('cover', $event)"
              />
              {{ 'settings.page.choose' | transloco }}
            </label>
            @if (me.coverUrl) {
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                [disabled]="busy()"
                (click)="remove('cover')"
              >
                {{ 'settings.page.remove' | transloco }}
              </button>
            }
          </div>
          @if (!me.coverUrl) {
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              [disabled]="busy()"
              (click)="newPattern()"
              data-testid="cover-pattern"
            >
              <ng-icon name="lucideShuffle" size="15" />
              {{ 'settings.page.newPattern' | transloco }}
            </button>
          }
        </div>
        @if (!me.coverUrl) {
          <div class="mt-5">
            <p class="text-sm font-semibold">
              {{ 'settings.page.coverColor' | transloco }}
            </p>
            <div
              class="mt-2 flex flex-wrap items-center gap-2.5"
              role="group"
              [attr.aria-label]="'settings.page.coverColor' | transloco"
            >
              @for (c of palette; track c) {
                <button
                  type="button"
                  class="h-9 w-9 rounded-full border-2 border-line transition-transform duration-100 lift-hitbox hover:-translate-y-0.5"
                  [class.ring-2]="shownColor(me) === c"
                  [class.ring-accent]="shownColor(me) === c"
                  [class.ring-offset-2]="shownColor(me) === c"
                  [class.ring-offset-canvas]="shownColor(me) === c"
                  [style.background]="c"
                  [attr.aria-label]="c"
                  [attr.aria-pressed]="shownColor(me) === c"
                  [disabled]="busy()"
                  (click)="saveColor(c)"
                  data-testid="cover-swatch"
                ></button>
              }
              <label
                class="relative ml-1 flex items-center gap-2 text-sm font-semibold"
                [title]="'settings.page.coverColorCustom' | transloco"
              >
                <input
                  id="cover-color"
                  type="color"
                  [value]="shownColor(me)"
                  (input)="previewColor.set($any($event.target).value)"
                  (change)="saveColor($any($event.target).value)"
                  data-testid="cover-color"
                />
                {{ 'settings.page.coverColorCustom' | transloco }}
              </label>
              @if (me.accentColor) {
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="saveColor('')"
                >
                  {{ 'settings.page.coverColorRandom' | transloco }}
                </button>
              }
            </div>
          </div>
        }
        <p class="mt-3 text-xs text-muted">{{ 'settings.page.coverImageHint' | transloco }}</p>
      </app-settings-section>

      <app-settings-section
        [title]="'settings.page.look' | transloco"
        [description]="'settings.page.lookHint' | transloco"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <app-field [label]="'settings.page.layout' | transloco">
            <app-select
              [ngModel]="me.pageSettings.layout"
              (ngModelChange)="save({ layout: $event })"
            >
              @for (l of layouts; track l) {
                <app-option [value]="l">{{ 'library.layout.' + l | transloco }}</app-option>
              }
            </app-select>
          </app-field>
          <app-field [label]="'settings.page.sort' | transloco">
            <app-select [ngModel]="me.pageSettings.sort" (ngModelChange)="save({ sort: $event })">
              @for (s of sorts; track s) {
                <app-option [value]="s">{{ 'library.sort.' + s | transloco }}</app-option>
              }
            </app-select>
          </app-field>
          <!-- What a visitor sees first, and how "All videos" divides for them. -->
          <app-field
            [label]="'settings.page.firstView' | transloco"
            [hint]="'settings.page.firstViewHint' | transloco"
          >
            <app-select
              [ngModel]="me.pageSettings.firstView"
              (ngModelChange)="save({ firstView: $event })"
              data-testid="first-view"
            >
              @for (v of firstViews; track v) {
                <app-option [value]="v">{{
                  'settings.page.firstViews.' + v | transloco
                }}</app-option>
              }
            </app-select>
          </app-field>
          <app-field
            [label]="'settings.page.grouping' | transloco"
            [hint]="'settings.page.groupingHint' | transloco"
          >
            <app-select
              [ngModel]="me.pageSettings.grouping"
              (ngModelChange)="save({ grouping: $event })"
              data-testid="grouping"
            >
              @for (g of groupings; track g) {
                <app-option [value]="g">{{
                  'settings.page.groupings.' + g | transloco
                }}</app-option>
              }
            </app-select>
          </app-field>
          <!-- A category's rows in "All videos" by category and the tiles' size; a
               category can have its own in its menu. -->
          <app-field
            [label]="'settings.page.categoryRows' | transloco"
            [hint]="'settings.page.categoryRowsHint' | transloco"
          >
            <app-select
              [ngModel]="me.pageSettings.categoryRows"
              (ngModelChange)="save({ categoryRows: $event })"
              data-testid="category-rows"
            >
              @for (n of rowChoices; track n) {
                <app-option [value]="n">{{
                  n === 0
                    ? ('library.look.all' | transloco)
                    : ('library.look.rowsCount' | transloco: { count: n })
                }}</app-option>
              }
            </app-select>
          </app-field>
          <app-field
            [label]="'settings.page.tileScale' | transloco"
            [hint]="'settings.page.tileScaleHint' | transloco"
          >
            <app-select
              [ngModel]="me.pageSettings.tileScale"
              (ngModelChange)="save({ tileScale: $event })"
              data-testid="tile-scale"
            >
              @for (t of tileScales; track t) {
                <app-option [value]="t">{{
                  'settings.page.tileScales.' + t | transloco
                }}</app-option>
              }
            </app-select>
          </app-field>
        </div>
      </app-settings-section>

      <!-- Pro and admins (everyone self-hosted) take the whole page out of sight. -->
      <app-settings-section
        [title]="'settings.page.hidden' | transloco"
        [description]="'settings.page.hiddenHint' | transloco"
      >
        @if (me.canHidePage || me.pageHidden) {
          <label class="flex items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              [ngModel]="me.pageHidden"
              [disabled]="busy() || (!me.canHidePage && !me.pageHidden)"
              (ngModelChange)="save({ hidden: $event })"
              data-testid="page-hidden"
            />
            {{ 'settings.page.hide' | transloco }}
          </label>
          @if (me.pageHidden && site.hasTiers() && me.role !== 'ADMIN') {
            <p class="mt-2 text-xs text-muted">{{ 'settings.page.hiddenUntilPro' | transloco }}</p>
          }
        } @else {
          <a
            class="inline-flex items-center gap-2.5 text-sm font-medium text-muted hover:text-text"
            [routerLink]="panelLink('pro')"
            data-testid="page-hidden-pro"
          >
            <input type="checkbox" disabled tabindex="-1" aria-hidden="true" />
            {{ 'settings.page.hidePro' | transloco }}
          </a>
        }
      </app-settings-section>
    }
  `,
})
export class PageSettingsPage {
  protected readonly auth = inject(AuthStore);
  protected readonly site = inject(SiteConfig);
  protected readonly panelLink = panelLink;
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly layouts: PageLayout[] = ['grid', 'list'];
  protected readonly sorts: CollectionSort[] = ['added', 'title', 'manual'];
  protected readonly firstViews: FirstView[] = ['videos', 'folders'];
  protected readonly groupings: ShelfGrouping[] = ['visibility', 'category', 'none'];
  protected readonly rowChoices = [0, 1, 2, 3, 4, 5, 6];
  protected readonly tileScales = TILE_SCALES;
  protected readonly busy = signal(false);
  /** The colour while the picker is open, before it is saved. */
  protected readonly previewColor = signal<string | null>(null);
  protected readonly coverColor = computed(
    () => this.previewColor() ?? this.auth.user()?.accentColor ?? null,
  );
  protected readonly palette = COVER_PALETTE;

  /** The colour the cover shows now: being picked, chosen, or the palette one for this user. */
  protected shownColor(me: MeDto): string {
    return this.coverColor() ?? defaultCoverColor(me.id);
  }

  /** Redraws the cover lines: any new number grows another pattern. */
  protected async newPattern(): Promise<void> {
    const coverPattern = Math.floor(Math.random() * 2_147_483_647);
    await this.run(() => this.api.invoke(usersUpdateProfile, { body: { coverPattern } }));
  }

  /** The cover colour (stored as the page colour); '' goes back to a palette colour. */
  protected async saveColor(color: string): Promise<void> {
    await this.run(() => this.api.invoke(usersUpdateProfile, { body: { accentColor: color } }));
    this.previewColor.set(null);
  }

  protected async upload(kind: 'avatar' | 'cover', event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      this.toast.error(this.t.translate('settings.page.tooLarge'));
      return;
    }
    await this.run(() =>
      this.api.invoke(kind === 'avatar' ? usersSetAvatar : usersSetCover, { body: { file } }),
    );
  }

  protected async remove(kind: 'avatar' | 'cover'): Promise<void> {
    await this.run(() => this.api.invoke(kind === 'avatar' ? usersRemoveAvatar : usersRemoveCover));
  }

  protected async save(patch: {
    layout?: PageLayout;
    sort?: CollectionSort;
    firstView?: FirstView;
    grouping?: ShelfGrouping;
    categoryRows?: number;
    tileScale?: TileScale;
    showCover?: boolean;
    hidden?: boolean;
  }): Promise<void> {
    await this.run(() => this.api.invoke(usersUpdatePageSettings, { body: patch }));
  }

  private async run(fn: () => Promise<MeDto>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      this.auth.setUser(await fn());
      this.toast.success(this.t.translate('common.saved'));
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}
