import { Location, NgTemplateOutlet } from '@angular/common';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import {
  Component,
  DestroyRef,
  type TemplateRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationStart, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolder, lucideLayoutGrid, lucideX } from '@ng-icons/lucide';

import {
  Api,
  type CollectionItemDto,
  type CollectionSection,
  type CollectionSummaryDto,
  type PageSettingsDto,
  collectionList,
  collectionSummary,
  collectionBuckets,
  type CollectionBucketsDto,
  collectionFeatured,
  collectionFolders,
  type FeaturedDto,
  type FirstView,
  type ShelfFolderDto,
  exchangeCreate,
} from '../../api';
import { errorText, toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ExchangeStore } from '../../core/exchange/exchange.store';
import { RequestGate } from '../exchange/request-dialogs';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { MosaicComponent } from '../../shared/ui/mosaic/mosaic';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { StackTileComponent } from '../../shared/ui/stack-tile/stack-tile';
import { FitRowDirective } from '../../shared/ui/fit-row/fit-row.directive';
import {
  ShelfFolderMenuComponent,
  type FolderMenuItem,
} from '../../shared/collection/shelf-folder-menu';
import { ShelfStickyBarComponent } from '../../shared/collection/shelf-sticky-bar';
import { ShelfStripComponent } from '../../shared/collection/shelf-strip';
import { ShelfFoldersComponent } from '../../shared/collection/shelf-folders';
import { bucketAtTop, scrollToBucket } from '../../shared/collection/bucket-scroll';
import { SCROLLER_FROM, ShelfScrollerComponent } from '../../shared/collection/shelf-scroller';
import {
  type SlotGroup,
  groupByMonth,
  monthLabel,
  videosBefore,
} from '../../shared/collection/slot-groups';
import {
  ShelfZoom,
  ShelfZoomComponent,
  ShelfZoomGesturesDirective,
  tileScaleFactor,
} from '../../shared/collection/shelf-zoom';
import { StrokeComponent, hashString } from '../../shared/ui/stroke/stroke';
import {
  type Slot,
  slotAspect,
  slotKey,
  stackPictures,
  tileCount,
  toSlots,
} from '../../shared/collection/slots';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { LanguageService } from '../../core/i18n/language.service';
import { VisitorPreview } from '../../core/preview/visitor-preview.service';
import { NavigationHistory } from '../../core/navigation/navigation-history';
import { panelLink } from '../../core/navigation/panels';
import { type SectionState, type Sections, type ShelfPart, ShelfCache } from './shelf-cache';
import { StackSheet } from './stack-sheet';
import { VideoCardComponent } from './video-card';
import { MAX_VIDEOS_PER_REQUEST } from '../exchange/exchange-limits';
import { type OfferPickData, OfferPickDialog } from '../exchange/offer-pick-dialog';
import { SEARCH_FROM, ShelfSearchComponent } from '../../shared/collection/shelf-search';
import { SHELF_SEARCH_MAX } from '../../shared/forms/limits';
import { LayoutFrame } from '../../core/layout/frame';

const PAGE = 60;
/** The most tiles a row of the shelf holds, at the smallest size ('s rows are filled to it). */
const TILES_PER_ROW = 16;
/** How many pages a category's first rows may take: a few hundred videos at most. */
const PREVIEW_PAGES = 5;
/** A category's preview in a list: this many lines for each of its rows. */
const LIST_LINES_PER_ROW = 4;
const ORDER: CollectionSection[] = ['PUBLIC', 'PRIVATE', 'OTHERS'];
/** The visibility sections as parts of the shelf. */
const BY_VISIBILITY: ShelfPart[] = ORDER.map((section) => ({
  key: section,
  titleKey: `collection.sections.${section}`,
  title: null,
  section,
}));
/** The one feed (grouping "none"). */
const ONE_FEED: ShelfPart[] = [{ key: 'ALL', titleKey: null, title: null, flat: true }];

/**
 * Sections of a user's page for visitors with the owner's category filter
 * applied across all sections and the owner's layout settings.
 */
@Component({
  selector: 'app-collection-view',
  host: { class: 'block' },
  imports: [
    ShelfSearchComponent,
    EmptyStateComponent,
    TranslocoPipe,
    FormsModule,
    NgTemplateOutlet,
    AlertComponent,
    AutoMoreComponent,
    ButtonDirective,
    InputDirective,
    MosaicComponent,
    SpinnerComponent,
    StackTileComponent,
    StrokeComponent,
    FitRowDirective,
    VideoCardComponent,
    NgIcon,
    ShelfFolderMenuComponent,
    ShelfStickyBarComponent,
    ShelfScrollerComponent,
    ShelfZoomComponent,
    ShelfZoomGesturesDirective,
    ShelfStripComponent,
    ShelfFoldersComponent,
  ],
  providers: [provideIcons({ lucideX, lucideLayoutGrid, lucideFolder })],
  template: `
    <div #controls>
      @if (canSelect() || (searchable() && !chips().length)) {
        <div class="mb-6 flex flex-wrap items-center gap-3">
          @if (canSelect()) {
            <button
              type="button"
              appButton
              [variant]="selecting() ? 'primary' : 'secondary'"
              size="sm"
              [attr.aria-pressed]="selecting()"
              data-testid="select-mode"
              (click)="toggleSelecting()"
            >
              {{ (selecting() ? 'exchange.multi.done' : 'exchange.multi.start') | transloco }}
            </button>
            <span class="label-mono text-muted">{{
              (selecting() ? 'exchange.multi.hint' : 'exchange.multi.hintModifiers') | transloco
            }}</span>
          }
          @if (searchable() && !chips().length) {
            <!-- By title within this shelf, in the open category. -->
            <app-shelf-search class="ml-auto" [value]="search()" (searched)="setSearch($event)" />
          }
          @if (zoomable() && !chips().length) {
            <app-shelf-zoom [class.ml-auto]="!searchable()" />
          }
        </div>
      }
      <!-- The owner's categories, set like the owner's own index: display type, the
         count as a small index, the open one underlined with a brush stroke. -->
      @if (chips().length) {
        <!-- On a phone the row scrolls sideways and the list of all is beside the search. -->
        <nav
          appFitRow
          [scrollBelow]="640"
          class="mb-10 flex flex-wrap items-end gap-x-6 gap-y-4 pb-2 max-sm:mb-3"
          [attr.aria-label]="'collection.filterLabel' | transloco"
        >
          <button
            type="button"
            class="index-tab"
            [class]="tabClass(categoryId() === null)"
            [attr.aria-current]="categoryId() === null ? 'page' : null"
            (click)="setCategory(null)"
          >
            <span class="index-tab">{{ 'library.folders.ALL' | transloco }}</span
            ><sup class="index-count">{{ summary()?.all ?? '' }}</sup>
            @if (categoryId() === null) {
              <app-stroke
                class="absolute inset-x-0 -bottom-2.5"
                [seed]="seed('ALL')"
                [height]="8"
                [thickness]="3.5"
              />
            }
          </button>
          @for (c of chips(); track c.id) {
            <button
              type="button"
              class="index-tab"
              [class]="tabClass(categoryId() === c.id)"
              [attr.aria-current]="categoryId() === c.id ? 'page' : null"
              (click)="setCategory(c.id)"
            >
              <span
                class="index-tab inline-block max-w-[min(20rem,70vw)] truncate align-bottom"
                [title]="c.name"
                >{{ c.name }}</span
              ><sup class="index-count">{{ c.count }}</sup>
              @if (categoryId() === c.id) {
                <app-stroke
                  class="absolute inset-x-0 -bottom-2.5"
                  [seed]="seed(c.id)"
                  [height]="8"
                  [thickness]="3.5"
                />
              }
            </button>
          }
          <!-- In the categories' row, at its end: no line of its own above the shelf. -->
          <span class="ml-auto flex shrink-0 items-center gap-2 self-center max-sm:hidden">
            <ng-container *ngTemplateOutlet="viewToggle" />
            @if (searchable() || zoomable()) {
              @if (searchable()) {
                <app-shelf-search [value]="search()" (searched)="setSearch($event)" />
              }
              @if (zoomable() && !showFolders()) {
                <app-shelf-zoom />
              }
            }
          </span>
        </nav>
        <div class="mb-8 flex items-center gap-2 sm:hidden">
          @if (searchable()) {
            <app-shelf-search
              class="min-w-0 flex-1"
              [value]="search()"
              (searched)="setSearch($event)"
            />
          }
          <ng-container *ngTemplateOutlet="viewToggle" />
          <app-shelf-folder-menu
            class="ml-auto shrink-0"
            [items]="folderItems()"
            [label]="'collection.sticky.allCategories' | transloco"
            [ariaLabel]="'collection.sticky.folders' | transloco"
            (picked)="pickFolder($event)"
          />
        </div>
      }
    </div>
    <app-shelf-sticky-bar
      [anchor]="controls"
      [items]="folderItems()"
      [label]="folderLabel()"
      [count]="folderCount()"
      [search]="search()"
      [searchable]="searchable()"
      [zoomable]="zoomable()"
      (picked)="pickFolder($event)"
      (searched)="setSearch($event)"
    />
    @if (scroller(); as sc) {
      <app-shelf-scroller
        [buckets]="sc.buckets"
        [by]="sc.by"
        [current]="atTop()"
        [lang]="lang()"
        [display]="bucketPart"
        (jump)="jumpTo($event)"
      />
    }
    <!-- The videos, or the categories as cards; the owner chooses which comes first. -->
    <ng-template #newSinceLine>
      @if (newCount() > 0) {
        <!-- What came since this visitor's last visit: a line, and only that on request. -->
        <p class="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="new-since">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
          @if (newOnly()) {
            <span>{{ 'collection.newSince.only' | transloco: { count: newCount() } }}</span>
            <button
              type="button"
              class="font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
              (click)="setNewOnly(false)"
            >
              {{ 'collection.newSince.all' | transloco }}
            </button>
          } @else {
            <span>{{ 'collection.newSince.count' | transloco: { count: newCount() } }}</span>
            <button
              type="button"
              class="font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
              (click)="setNewOnly(true)"
              data-testid="new-since-show"
            >
              {{ 'collection.newSince.show' | transloco }}
            </button>
          }
        </p>
      }
    </ng-template>
    <ng-template #viewToggle>
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-full bg-surface-2 p-0.5"
        role="group"
        [attr.aria-label]="'collection.view.label' | transloco"
      >
        @for (v of views; track v) {
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            [class.bg-inverse]="shownView() === v"
            [class.text-on-inverse]="shownView() === v"
            [class.text-muted]="shownView() !== v"
            [attr.aria-label]="'collection.view.' + v | transloco"
            [attr.aria-pressed]="shownView() === v"
            [attr.data-testid]="'view-' + v"
            (click)="setView(v)"
          >
            <ng-icon [name]="v === 'videos' ? 'lucideLayoutGrid' : 'lucideFolder'" size="14" />
          </button>
        }
      </div>
    </ng-template>
    @if (error(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!loaded()) {
      <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
    } @else if (showFolders()) {
      <ng-container *ngTemplateOutlet="newSinceLine" />
      <app-shelf-folders [folders]="folders()" (picked)="openFolder($event)" />
    } @else if (items().length === 0) {
      @if (search()) {
        <app-empty-state
          [text]="'collection.search.nothing' | transloco: { q: search() }"
          [seed]="27"
        />
      } @else {
        <app-empty-state [text]="'profile.noVideos' | transloco" [seed]="17" />
      }
    } @else {
      <ng-container *ngTemplateOutlet="newSinceLine" />
      @if (search()) {
        <p class="mb-4 text-sm text-muted" data-testid="search-scope">
          {{ 'collection.search.wholeShelf' | transloco: { count: total() } }}
        </p>
      }
      <div appShelfZoomGestures>
        @if (featuredSlots().length) {
          <!-- What the owner put on top of "All videos": one row that scrolls sideways. -->
          <section class="mb-16" data-testid="featured">
            <h2 class="index-title mb-5">
              {{ 'collection.featured.title' | transloco
              }}<sup class="index-count">{{ featuredSlots().length }}</sup>
            </h2>
            <app-shelf-strip
              [items]="featuredSlots()"
              [key]="slotKey"
              [aspect]="slotAspect"
              [count]="sizeCount() ?? 0"
              [zoom]="zoomOf(null)"
              [itemTemplate]="cardTpl"
            />
          </section>
        }
        @for (group of groups(); track group.key) {
          <section class="mb-16" [attr.data-testid]="'section-' + group.key">
            @if (group.titleKey || group.title) {
              <h2 class="index-title mb-5">
                {{ group.titleKey ? (group.titleKey | transloco) : group.title
                }}<sup class="index-count">{{ group.total }}</sup>
              </h2>
            }
            <!-- Newest first, each section is cut by month with a heading each. -->
            @for (m of group.months; track m.key; let first = $first; let last = $last) {
              @if (m.key) {
                <h3
                  class="mb-3 flex items-start font-display text-base leading-tight font-bold tracking-tight sm:text-lg"
                  [class.mt-8]="!first"
                  [attr.data-month]="group.key + ':' + m.key"
                  data-testid="month-heading"
                >
                  {{ monthTitle(m.key)
                  }}<sup class="index-count">{{ monthCount(group.key, m) }}</sup>
                </h3>
              }
              @if (settings().layout === 'list') {
                <div class="flex flex-col gap-1.5">
                  @for (slot of m.slots; track slotKey(slot)) {
                    <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: slot }" />
                  }
                </div>
                @if (group.rows && !group.complete) {
                  <ng-container *ngTemplateOutlet="showAll; context: { $implicit: group }" />
                }
              } @else {
                <app-mosaic
                  #mosaic
                  [items]="m.slots"
                  [key]="slotKey"
                  [aspect]="slotAspect"
                  [count]="sizeCount()"
                  [memoryKey]="cacheKey() + '|' + group.key + '|' + m.key"
                  [more]="last && group.hasMore"
                  [zoom]="zoomOf(group)"
                  [maxRows]="group.rows ?? 0"
                  [itemTemplate]="cardTpl"
                />
                <!-- A category's first rows only: the rest is one click away. -->
                @if (group.rows && (!group.complete || mosaic.drawn() < m.slots.length)) {
                  <ng-container *ngTemplateOutlet="showAll; context: { $implicit: group }" />
                }
              }
            }
            <!-- Sections come one after another as the page scrolls; each pages on its own. -->
            @if (group.hasMore) {
              <app-auto-more
                class="mt-2"
                [attr.data-testid]="'more-' + group.key"
                [more]="true"
                [count]="group.items.length"
                [busy]="group.loading"
                [load]="loader(group.key)"
              />
            }
          </section>
        }
      </div>
    }

    <ng-template #showAll let-group>
      <button
        type="button"
        class="mt-3 text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text"
        [attr.data-testid]="'show-all-' + group.key"
        (click)="openFolder(group.categoryId)"
      >
        {{ 'collection.showAll' | transloco: { count: group.total } }}
      </button>
    </ng-template>

    <ng-template #cardTpl let-slot let-height="height">
      @if (slot.kind === 'stack') {
        <!-- A stack opens in its window; its videos are picked there. -->
        <button
          type="button"
          class="group relative block w-full cursor-pointer text-left outline-none"
          [class]="
            settings().layout === 'list'
              ? 'flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-surface-2 focus-visible:border-line'
              : 'block'
          "
          [attr.aria-label]="stackLabel(slot)"
          [attr.data-stack-id]="slot.id"
          (click)="openStack(slot.id)"
        >
          <app-stack-tile
            [items]="stackPictures(slot)"
            [size]="slot.size"
            [name]="slot.name"
            [layout]="settings().layout"
            [height]="height ?? null"
            [blurred]="blurs(stackPictures(slot)[0]!)"
          />
          @if (slot.items.some(isFresh)) {
            <span
              class="pointer-events-none absolute top-2 right-2 z-10 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-white/80"
              role="img"
              [attr.aria-label]="'collection.freshHint' | transloco"
              data-testid="fresh-dot"
            ></span>
          }
        </button>
      } @else {
        <app-video-card
          [item]="slot.item"
          [username]="username()"
          [layout]="settings().layout"
          [height]="height ?? null"
          [selectable]="selecting() && requestable(slot.item)"
          [requestable]="canSelect() && requestable(slot.item)"
          [selected]="selected().has(slot.item.video.id)"
          [fresh]="isFresh(slot.item)"
          [context]="foundIn(slot.item)"
          (toggled)="toggleVideo($event)"
        />
      }
    </ng-template>

    <!-- The open stack's videos, drawn inside its window (a dialog, see StackSheet). -->
    <ng-template #stackContent>
      @if (settings().layout === 'grid') {
        <app-mosaic
          class="block min-h-40"
          [items]="stackSlots()"
          [key]="slotKey"
          [aspect]="slotAspect"
          [count]="stackSizing()"
          [itemTemplate]="cardTpl"
        />
      } @else {
        <div class="flex flex-col gap-1.5">
          @for (slot of stackSlots(); track slotKey(slot)) {
            <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: slot }" />
          }
        </div>
      }
    </ng-template>

    @if (selected().size) {
      <div
        class="fixed bottom-5 left-1/2 z-40 flex w-[min(52rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-inverse p-2 pl-4 text-sm text-on-inverse shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] sm:flex-row sm:items-center"
        data-testid="request-bar"
        animate.enter="dock-in"
        animate.leave="dock-out"
      >
        <span class="font-semibold whitespace-nowrap">{{
          'library.selected' | transloco: { count: selected().size }
        }}</span>
        <textarea
          appInput
          rows="1"
          class="ts-optional min-h-10 sm:flex-1"
          maxlength="1000"
          [(ngModel)]="message"
          [placeholder]="'exchange.messagePlaceholder' | transloco"
          [attr.aria-label]="'exchange.messagePlaceholder' | transloco"
        ></textarea>
        <div class="flex items-center gap-2">
          <!-- "I offer in return…", as on the video page. -->
          <button
            type="button"
            class="shrink-0 rounded-md px-2 py-2 text-xs font-semibold whitespace-nowrap text-on-inverse/85 underline decoration-accent decoration-2 underline-offset-4 hover:text-on-inverse"
            data-testid="offer-in-return"
            (click)="pickOffer()"
          >
            {{
              (offered().length ? 'exchange.offerPick.offering' : 'exchange.offerPick.add')
                | transloco: { count: offered().length }
            }}
          </button>
          <button
            type="button"
            appButton
            class="flex-1 sm:flex-none"
            [disabled]="busy()"
            data-testid="request-selected"
            (click)="requestSelected()"
          >
            {{ 'exchange.multi.request' | transloco: { count: selected().size } }}
          </button>
          <button
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-on-inverse/70 transition-colors hover:bg-on-inverse/15 hover:text-on-inverse"
            [attr.aria-label]="'library.clearSelection' | transloco"
            (click)="clearSelection()"
          >
            <ng-icon name="lucideX" size="18" />
          </button>
        </div>
      </div>
    }
  `,
})
export class CollectionViewComponent {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly gate = inject(RequestGate);
  private readonly exchange = inject(ExchangeStore);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly history = inject(NavigationHistory);
  private readonly sensitive = inject(SensitiveContentService);
  private readonly preview = inject(VisitorPreview);
  private readonly stackSheet = inject(StackSheet);
  private readonly stackContent = viewChild.required<TemplateRef<unknown>>('stackContent');
  private sheetRef: DialogRef<void> | null = null;

  readonly username = input.required<string>();
  readonly pageSettings = input<PageSettingsDto | null>(null);
  /** Owner previewing their own page: the request still answers as owner, so hide what visitors never see. */
  readonly asVisitor = input(false);

  /**
   * Every section of the shelf, each paged on its own (order kept): with one shared paging a
   * shelf with many public videos showed no private ones at all, and the headings counted what was
   * loaded, not what there is.
   */
  protected readonly sections = signal<Sections>({});
  /** The parts the shelf shows, in order: as the owner groups "All videos". */
  protected readonly parts = signal<ShelfPart[]>(BY_VISIBILITY);
  protected readonly items = computed(() =>
    this.parts().flatMap((p) => this.sections()[p.key]?.items ?? []),
  );
  protected readonly total = computed(() =>
    this.parts().reduce((n, p) => n + (this.sections()[p.key]?.total ?? 0), 0),
  );
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly summary = signal<CollectionSummaryDto | null>(null);
  private readonly summaryFailed = signal(false);
  /**
   * The size of every tile on the page follows the whole shelf, not a section or a category
   * until the summary is in, nothing is drawn rather than drawn twice.
   */
  protected readonly sizeCount = computed(() => {
    const s = this.summary();
    if (s) return tileCount(s.all, s.stacked, s.stacks);
    return this.summaryFailed() ? this.total() : null;
  });
  /** The owner's category the visitor filters by; in the address (`?category=`), so a reload keeps it. */
  protected readonly categoryId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('category'),
  );
  /** A title search within the shelf, in the address too (`?q=`): back from a video keeps it. */
  protected readonly search = signal(
    (this.route.snapshot.queryParamMap.get('q') ?? '').slice(0, SHELF_SEARCH_MAX),
  );
  protected readonly searchable = computed(
    () => !!this.search() || (this.summary()?.all ?? 0) >= SEARCH_FROM,
  );
  protected readonly settings = computed<PageSettingsDto>(
    () =>
      this.pageSettings() ?? {
        layout: 'grid',
        tileSize: 'md',
        sort: 'added',
        showCover: false,
        firstView: 'videos',
        grouping: 'visibility',
        categoryRows: 2,
        tileScale: 'md',
      },
  );
  protected readonly views: FirstView[] = ['videos', 'folders'];
  /** The visitor's own choice (`?view=`), else the owner's first screen. */
  protected readonly view = signal<FirstView | null>(
    viewFrom(this.route.snapshot.queryParamMap.get('view')),
  );
  protected readonly shownView = computed<FirstView>(() =>
    this.categoryId() === null ? (this.view() ?? this.settings().firstView) : 'videos',
  );
  /** A shelf without visible categories has no cards to show: its videos, then. */
  private readonly noFolders = signal(false);
  /** The categories as cards, on "All videos" without a search. */
  protected readonly showFolders = computed(
    () => this.shownView() === 'folders' && !this.search() && !this.newOnly() && !this.noFolders(),
  );
  protected readonly folders = signal<ShelfFolderDto[]>([]);
  /** The owner's "Featured" strip on top of "All videos". */
  private readonly featured = signal<{ username: string; strip: FeaturedDto } | null>(null);
  protected readonly featuredSlots = computed<Slot[]>(() => {
    const kept = this.featured();
    // Another person's page: not theirs until it comes.
    const f = kept?.username === this.username() ? kept.strip : null;
    if (!f || this.categoryId() !== null || this.search() || this.newOnly()) return [];
    const at = (slot: Slot) => {
      const i = f.order.indexOf(slotKey(slot));
      return i < 0 ? f.order.length : i;
    };
    return toSlots(f.items).sort((a, b) => at(a) - at(b));
  });
  protected readonly slotKey = slotKey;
  protected readonly slotAspect = slotAspect;
  protected readonly stackPictures = stackPictures;
  /** The stack open in its window (?stack=…) and the videos of it this viewer may see. */
  protected readonly openStackId = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('stack'))),
    { initialValue: null },
  );
  protected readonly stackItems = signal<CollectionItemDto[]>([]);
  protected readonly stackSlots = computed<Slot[]>(() =>
    this.stackItems().map((item) => ({ kind: 'video', item })),
  );
  /** Tiles in the window stay handy (never the showcase size two videos would get on a shelf). */
  protected readonly stackSizing = computed(() => Math.max(this.stackSlots().length, 8));
  protected readonly chips = computed(() =>
    (this.summary()?.categories ?? []).filter((c) => !c.hidden && c.count > 0),
  );
  /** Only what is new since this visitor's last visit (`?new=1`). */
  protected readonly newOnly = signal(this.route.snapshot.queryParamMap.get('new') === '1');
  private readonly newSince = computed(() =>
    this.preview.active() ? null : (this.summary()?.newSince ?? null),
  );
  protected readonly newCount = computed(() =>
    this.newSince() ? (this.summary()?.newCount ?? 0) : 0,
  );
  /** Each section's months or letters. */
  protected readonly sectionBuckets = signal<Partial<Record<string, CollectionBucketsDto>>>({});
  protected readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  /** The quick scroller on a long shelf: every shown part's marks, keyed "PART:bucket". */
  protected readonly scroller = computed(() => {
    const all = this.sectionBuckets();
    const parts = this.parts();
    const by = parts.map((p) => all[p.key]?.by).find((b) => !!b) ?? null;
    if (!by || this.total() < SCROLLER_FROM || this.showFolders()) return null;
    const buckets = parts.flatMap((p) =>
      (all[p.key]?.buckets ?? []).map((b) => ({ key: `${p.key}:${b.key}`, count: b.count })),
    );
    return buckets.length >= 2 ? { by, buckets } : null;
  });
  protected readonly atTop = signal<string | null>(null);
  protected readonly bucketPart = (key: string): string => key.slice(key.indexOf(':') + 1);

  /** The viewer's tile size: mosaic only, a list has none. */
  protected readonly zoom = inject(ShelfZoom);
  protected readonly zoomable = computed(
    () => this.settings().layout !== 'list' && !this.showFolders(),
  );
  /** "All videos" and the categories, for the phone's list and the compact bar. */
  protected readonly folderItems = computed<FolderMenuItem[]>(() => {
    this.language.loaded();
    return [
      {
        key: '',
        label: this.t.translate('library.folders.ALL'),
        count: this.summary()?.all ?? null,
        current: this.categoryId() === null,
      },
      ...this.chips().map((c) => ({
        key: c.id,
        label: c.name,
        count: c.count,
        current: this.categoryId() === c.id,
      })),
    ];
  });
  protected readonly folderLabel = computed(
    () =>
      this.folderItems().find((f) => f.current)?.label ?? this.t.translate('library.folders.ALL'),
  );
  protected readonly folderCount = computed(
    () => this.folderItems().find((f) => f.current)?.count ?? null,
  );
  /** Logged-in visitors may pick private videos and request them in one go. */
  protected readonly canSelect = computed(
    () => !!this.auth.user() && !this.asVisitor() && this.items().some((i) => this.requestable(i)),
  );
  protected readonly selecting = signal(false);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);
  protected message = '';
  /** My videos offered in return for the picked ones. */
  protected readonly offered = signal<string[]>([]);
  /**
   * The parts in order, each shown once the one above it is in full: the page scrolls
   * through all public videos, then the private ones appear, then the others' (or category after
   * category).
   */
  protected readonly groups = computed(() => {
    const groups = [];
    for (const part of this.parts()) {
      const st = this.sections()[part.key];
      if (!st || st.items.length === 0) continue;
      const complete = st.items.length >= st.total;
      // A category's preview never pages and never holds back the ones below it.
      const hasMore = !complete && !part.rows;
      const all = toSlots(st.items);
      // A list has no rows to count: a few lines a row.
      const slots =
        part.rows && this.settings().layout === 'list'
          ? all.slice(0, part.rows * LIST_LINES_PER_ROW)
          : all;
      groups.push({
        ...part,
        items: st.items,
        total: st.total,
        complete: complete && slots.length === all.length,
        slots,
        months: this.monthly(part.key) && !part.rows ? groupByMonth(slots) : [{ key: '', slots }],
        hasMore,
        loading: st.loading,
      });
      if (hasMore) break;
    }
    return groups;
  });
  /** The next page of each part, for the line under it (one function each: an input). */
  private readonly loaders = new Map<string, () => Promise<void>>();
  protected loader(key: string): () => Promise<void> {
    let load = this.loaders.get(key);
    if (!load) this.loaders.set(key, (load = () => this.loadMore(key)));
    return load;
  }
  private readonly cache = inject(ShelfCache);
  /** Bumped on every new start: answers for a previous category or person are dropped. */
  private generation = 0;

  constructor() {
    // Scrolling, on the window and passive: as a host binding, every scrolled frame re-checked the
    // page and every tile of the shelf.
    const onScroll = () => this.spyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('scroll', onScroll));
    // The footer waits under the sections until they are in (a layout shift otherwise).
    inject(LayoutFrame).holdFooterWhile(
      () => !this.error() && (!this.loaded() || this.groups().some((g) => g.hasMore)),
    );
    let shownFor: string | null = null;
    effect(() => {
      const username = this.username();
      if (shownFor && shownFor !== username)
        untracked(() => {
          this.setCategory(null);
          this.setSearch('');
          this.view.set(null);
          this.noFolders.set(false);
        });
      shownFor = username;
      this.categoryId();
      this.search();
      if (this.newOnly()) this.newSince(); // only what is new: once the line is known
      this.preview.active(); // the owner switching the visitor preview: the list is a guest's now
      this.showFolders();
      void this.settings().grouping;
      untracked(() => this.start());
    });
    effect(() => {
      this.username();
      this.preview.active();
      untracked(() => void this.loadSummary());
    });
    effect(() => {
      const username = this.username();
      const stackId = this.openStackId();
      untracked(() => {
        this.stackItems.set(stackId ? this.items().filter((i) => i.stack?.id === stackId) : []);
        if (!stackId) {
          this.sheetRef?.close();
          this.sheetRef = null;
          return;
        }
        this.sheetRef ??= this.stackSheet.open({
          name: computed(() => this.stackItems()[0]?.stack?.name ?? null),
          size: computed(() => this.stackItems().length),
          category: signal(null),
          owner: false,
          fromStackId: stackId,
          dropOut: signal(false),
          content: this.stackContent(),
          onClose: () => this.closeStack(),
        });
        void this.api
          .invoke(collectionList, { username, stackId, limit: 100 })
          .then((page) => {
            if (this.openStackId() === stackId) this.stackItems.set(page.items);
          })
          .catch(() => undefined);
      });
    });
  }

  /**
   * Where the page was when a navigation away began: by the time this view is destroyed the router
   * has already scrolled the next page to the top.
   */
  private leftAt = 0;
  private readonly leaving = this.router.events
    .pipe(filter((e) => e instanceof NavigationStart))
    .subscribe(() => (this.leftAt = window.scrollY));
  /** Stops a scroll back still waiting for the page to grow: it scrolled the next page. */
  private stopRestore: (() => void) | null = null;
  private readonly destroyRef = inject(DestroyRef).onDestroy(() => {
    this.stopRestore?.();
    this.sheetRef?.close();
    this.leaving.unsubscribe();
    if (this.loaded() && !this.showFolders())
      this.cache.save(this.cacheKey(), this.parts(), this.sections(), this.summary(), this.leftAt);
  });

  /** Whose eyes the kept page was for too: after signing in as someone else, Back showed the
   * previous viewer's sections. */
  protected cacheKey(): string {
    return `${this.auth.user()?.id ?? ''}|${this.username()}|${this.categoryId() ?? ''}|${this.search()}|${this.preview.active()}|${this.newOnly()}|${this.settings().grouping}`;
  }

  /**
   * Starts the shelf: back from a video (the browser's back), as it was left, scroll included
   * otherwise the first page of every section.
   */
  private start(): void {
    const generation = ++this.generation;
    if (this.categoryId() === null && !this.search() && !this.newOnly())
      void this.fetchFeatured(generation);
    if (this.showFolders()) {
      void this.fetchFolders(generation);
      return;
    }
    const back = this.router.lastSuccessfulNavigation()?.trigger === 'popstate';
    const kept = back ? this.cache.take(this.cacheKey()) : null;
    if (kept) {
      this.parts.set(kept.parts);
      this.sections.set(kept.sections);
      if (kept.summary) this.summary.set(kept.summary);
      this.loaded.set(true);
      this.error.set(null);
      void this.fetchBuckets(generation);
      this.stopRestore = restoreScroll(kept.scrollY);
      return;
    }
    this.sections.set({});
    this.loaded.set(false);
    this.error.set(null);
    void this.planParts().then((parts) => {
      if (generation !== this.generation) return;
      this.parts.set(parts);
      void this.fetchBuckets(generation);
      void Promise.all(
        parts.map((p) =>
          p.rows ? this.fetchPreview(p, generation) : this.fetchSection(p, generation),
        ),
      ).then(() => {
        if (generation === this.generation) this.loaded.set(true);
      });
    });
  }

  /**
   * How the shelf divides now: by visibility as before; one feed; or, on "All videos", a
   * part per category and one for the rest. Inside a category or a search, "by category" is one feed.
   */
  private async planParts(): Promise<ShelfPart[]> {
    const grouping = this.settings().grouping;
    if (grouping === 'visibility') return BY_VISIBILITY;
    if (grouping === 'none' || this.categoryId() !== null || this.search()) return ONE_FEED;
    const summary = this.summary() ?? (await this.loadSummary());
    const chips = (summary?.categories ?? []).filter((c) => !c.hidden && c.count > 0);
    return [
      ...chips.map((c) => ({
        key: `cat-${c.id}`,
        titleKey: null,
        title: c.name,
        categoryId: c.id,
        flat: true,
        // Its own rows, else the page's; the last part, the rest, always in full.
        rows: c.previewRows ?? this.settings().categoryRows,
      })),
      {
        key: 'cat-none',
        titleKey: chips.length ? 'collection.sections.uncategorized' : null,
        title: null,
        categoryId: 'none',
        flat: true,
      },
    ];
  }

  /** The page's counts, once per person and preview: the start may wait for them. */
  private summaryFor: { key: string; promise: Promise<CollectionSummaryDto | null> } | null = null;
  private loadSummary(): Promise<CollectionSummaryDto | null> {
    const username = this.username();
    const key = `${username}|${this.preview.active()}`;
    if (this.summaryFor?.key !== key)
      this.summaryFor = {
        key,
        promise: this.api
          .invoke(collectionSummary, { username })
          .then((s) => {
            this.summary.set(s);
            return s;
          })
          .catch(() => {
            this.summaryFailed.set(true);
            return null;
          }),
      };
    return this.summaryFor.promise;
  }

  private async fetchFolders(generation: number): Promise<void> {
    this.loaded.set(false);
    this.error.set(null);
    try {
      const { folders } = await this.api.invoke(collectionFolders, { username: this.username() });
      if (generation !== this.generation) return;
      // The owner previewing as a visitor: no hidden categories.
      const shown = this.asVisitor() ? folders.filter((f) => !f.hidden) : folders;
      this.folders.set(shown);
      if (!shown.length) this.noFolders.set(true);
      else this.loaded.set(true);
    } catch (e) {
      if (generation === this.generation) this.error.set(errorText(e));
    }
  }

  private async fetchFeatured(generation: number): Promise<void> {
    const username = this.username();
    try {
      const f = await this.api.invoke(collectionFeatured, { username });
      if (generation !== this.generation) return;
      const strip = this.asVisitor()
        ? { ...f, items: f.items.filter((i) => this.visibleToGuests(i)) }
        : f;
      this.featured.set({ username, strip });
    } catch {
      this.featured.set(null);
    }
  }

  /** What a guest gets of the owner's own listing, for the owner previewing the page. */
  private visibleToGuests(i: CollectionItemDto): boolean {
    return (
      !i.hidden &&
      i.video.status === 'READY' &&
      (i.source !== 'PUBLIC_ADD' || i.video.visibility === 'PUBLIC')
    );
  }

  protected setView(view: FirstView): void {
    if (this.view() === view && this.categoryId() === null) return;
    this.noFolders.set(false);
    this.categoryId.set(null);
    this.view.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view, category: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openFolder(id: string | undefined): void {
    if (!id) return;
    this.setCategory(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /**
   * The tiles' size: the owner's for the shelf or a category's own, and the visitor's
   * "smaller / bigger" from it. `part`: a category's part of "All videos"; null: the rest.
   */
  protected zoomOf(part: ShelfPart | null): number {
    const settings = this.settings();
    const id = part?.categoryId && part.categoryId !== 'none' ? part.categoryId : this.categoryId();
    const own = id ? this.summary()?.categories.find((c) => c.id === id)?.tileScale : null;
    return this.zoom.factor() * tileScaleFactor(own ?? settings.tileScale);
  }

  /**
   * Added after this visitor's previous visit; the line comes with the summary, and the
   * owner previewing the page as a visitor gets none.
   */
  protected readonly isFresh = (item: CollectionItemDto): boolean => {
    const since = this.preview.active() ? null : this.summary()?.newSince;
    return !!since && item.addedAt > since;
  };

  protected blurs(item: CollectionItemDto): boolean {
    const own = !this.preview.active() && this.auth.user()?.username === this.username();
    return !own && this.sensitive.blurs(item.video);
  }

  protected stackLabel(slot: Extract<Slot, { kind: 'stack' }>): string {
    return this.t.translate('stacks.tileLabel', {
      name: slot.name ?? this.t.translate('stacks.stack'),
      count: slot.size,
    });
  }

  protected openStack(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { stack: id },
      queryParamsHandling: 'merge',
    });
  }

  /** Back when the stack was opened from this page, else just drop it from the address. */
  protected closeStack(): void {
    const without = this.router.serializeUrl(
      this.router.createUrlTree([], {
        relativeTo: this.route,
        queryParams: { stack: null },
        queryParamsHandling: 'merge',
      }),
    );
    if (this.history.previous() === without) this.location.back();
    else void this.router.navigateByUrl(without);
  }

  protected requestable(item: CollectionItemDto): boolean {
    return item.video.visibility === 'PRIVATE' && item.source !== 'PUBLIC_ADD';
  }

  protected toggleSelecting(): void {
    this.selecting.update((v) => !v);
    this.selected.set(new Set());
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
    this.selecting.set(false);
  }

  protected toggleVideo(id: string): void {
    this.selecting.set(true);
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected pickOffer(): void {
    const ref = this.dialog.open<string[]>(OfferPickDialog, {
      data: {
        holderUsername: this.username(),
        picked: this.offered(),
        max: Math.max(0, MAX_VIDEOS_PER_REQUEST - this.selected().size),
      } satisfies OfferPickData,
      backdropClass: 'vs-backdrop',
      autoFocus: 'dialog',
    });
    ref.closed.subscribe((picked) => {
      if (picked) this.offered.set(picked);
    });
  }

  protected async requestSelected(): Promise<void> {
    if (this.busy() || this.selected().size === 0) return;
    if (this.auth.user()?.emailVerified === false) {
      this.toast.error(this.t.translate('auth.verify.bannerText')); // As on the video page
      return;
    }
    this.busy.set(true); // from the first click: no second hint, no second request
    try {
      if (!(await this.gate.confirm())) return;
      const result = await this.api.invoke(exchangeCreate, {
        body: {
          holderUsername: this.username(),
          videoIds: [...this.selected()],
          message: this.message.trim() || undefined,
          offerVideoIds: this.offered().length ? this.offered() : undefined,
        },
      });
      this.toast.success(
        this.t.translate(result.skipped.length ? 'exchange.multi.sentPartial' : 'exchange.sent', {
          count: result.request.requested.length,
          skipped: result.skipped.length,
        }),
      );
      this.exchange.changed();
      this.selecting.set(false);
      this.selected.set(new Set());
      this.offered.set([]);
      void this.router.navigate(panelLink('exchange', result.request.id), {
        queryParamsHandling: 'merge',
      });
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  protected tabClass(current: boolean): string {
    return (
      'relative flex shrink-0 items-start whitespace-nowrap transition-colors ' +
      (current ? 'text-text' : 'text-faint hover:text-text')
    );
  }

  /** The brush stroke under the open tab is drawn the same way every time for the same tab. */
  protected seed(key: string): number {
    return hashString(`${this.username()}:${key}`);
  }

  /** Where a search over the whole shelf found the video: its category, as the visitor sees it. */
  protected foundIn(item: CollectionItemDto): string | null {
    if (!this.search() || !item.categoryId) return null;
    return this.chips().find((c) => c.id === item.categoryId)?.name ?? null;
  }

  protected pickFolder(key: string): void {
    this.setCategory(key || null);
  }

  protected setCategory(id: string | null): void {
    if (this.categoryId() === id) return;
    this.categoryId.set(id);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setSearch(search: string): void {
    if (this.search() === search) return;
    this.search.set(search);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: search || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setNewOnly(on: boolean): void {
    if (this.newOnly() === on) return;
    this.newOnly.set(on);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { new: on ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Newest first, no search: a part is cut by month. */
  protected monthly(key: string): boolean {
    return !this.search() && this.sectionBuckets()[key]?.by === 'month';
  }

  protected monthTitle(key: string): string {
    return monthLabel(key, this.lang());
  }

  /** A month's videos as the server counts them; until it has, the tiles shown. */
  protected monthCount(key: string, group: SlotGroup): number {
    return (
      this.sectionBuckets()[key]?.buckets.find((b) => b.key === group.key)?.count ??
      group.slots.length
    );
  }

  /** The scroller let go on a month or letter of a section: load that far, then go there. */
  protected async jumpTo(key: string): Promise<void> {
    const sc = this.scroller();
    if (!sc) return;
    const cut = key.lastIndexOf(':');
    const target = key.slice(0, cut);
    const bucket = key.slice(cut + 1);
    const generation = this.generation;
    // Parts come one after another: the ones above load in full first.
    for (const part of this.parts()) {
      const want =
        part.key === target
          ? videosBefore(this.sectionBuckets()[part.key]?.buckets ?? [], bucket) + 1
          : Infinity;
      const st = () => this.sections()[part.key] ?? { items: [], total: 0, loading: false };
      while (generation === this.generation && st().items.length < Math.min(want, st().total)) {
        const before = st().items.length;
        await this.fetchSection(part, generation, false, 100);
        if (st().items.length === before) break;
      }
      if (part.key === target) break;
    }
    const slots = this.groups().find((g) => g.key === target)?.slots ?? [];
    if (await scrollToBucket(bucket, sc.by, slots, key)) this.atTop.set(key);
  }

  private spyFrame = 0;
  protected spyScroll(): void {
    if (this.spyFrame || !this.scroller()) return;
    this.spyFrame = requestAnimationFrame(() => {
      this.spyFrame = 0;
      const sc = this.scroller();
      if (!sc) return;
      for (const g of this.groups()) {
        const key = bucketAtTop(g.slots, sc.by, true);
        if (key) {
          this.atTop.set(`${g.key}:${key}`);
          return;
        }
      }
    });
  }

  /** The next page of one part; a failure is thrown for the line under it to offer a retry. */
  async loadMore(key: string): Promise<void> {
    const part = this.parts().find((p) => p.key === key);
    if (!part || this.sections()[key]?.loading) return;
    await this.fetchSection(part, this.generation, true);
  }

  /** What the category, search and "only new" ask of every listing of the shelf. */
  private listParams() {
    return {
      // A search covers the whole shelf: the tiles say which category each is in.
      categoryId: this.search() ? undefined : (this.categoryId() ?? undefined),
      q: this.search() || undefined,
      addedAfter: this.newOnly() ? (this.newSince() ?? undefined) : undefined,
    };
  }

  /** Each part's months (or letters), for its headings and the quick scroller. */
  private async fetchBuckets(generation: number): Promise<void> {
    this.sectionBuckets.set({});
    if (this.search()) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await Promise.all(
      // A category's preview has no months.
      this.parts()
        .filter((part) => !part.rows)
        .map(async (part) => {
          try {
            const b = await this.api.invoke(collectionBuckets, {
              username: this.username(),
              tz,
              ...this.listParams(),
              ...partParams(part),
            });
            if (generation === this.generation)
              this.sectionBuckets.update((all) => ({ ...all, [part.key]: b }));
          } catch {
            // no headings for that section
          }
        }),
    );
  }

  /**
   * A category's first rows, counted in tiles: a stack is one tile however many videos it
   * holds, so a category of stacks took one row of the rows asked for — the videos fetched for
   * them folded into a few stacks. More pages come until there are tiles enough for the rows, the
   * category is in full, or a few hundred videos are in.
   */
  private async fetchPreview(part: ShelfPart, generation: number): Promise<void> {
    const want = (part.rows ?? 0) * TILES_PER_ROW;
    for (let page = 0; page < PREVIEW_PAGES; page++) {
      const before = this.sections()[part.key]?.items.length ?? 0;
      await this.fetchSection(part, generation, false, page ? 100 : Math.min(100, want));
      if (generation !== this.generation) return;
      const st = this.sections()[part.key];
      if (!st || st.items.length === before || st.items.length >= st.total) return;
      if (toSlots(st.items).length >= want) return;
    }
  }

  private async fetchSection(
    part: ShelfPart,
    generation: number,
    rethrow = false,
    limit = PAGE,
  ): Promise<void> {
    const empty: SectionState = { items: [], total: 0, loading: false };
    const patch = (p: Partial<SectionState>) =>
      this.sections.update((all) => ({
        ...all,
        [part.key]: { ...(all[part.key] ?? empty), ...p },
      }));
    patch({ loading: true });
    try {
      const page = await this.api.invoke(collectionList, {
        username: this.username(),
        offset: this.sections()[part.key]?.items.length ?? 0,
        limit,
        ...this.listParams(),
        ...partParams(part),
      });
      if (generation !== this.generation) return;
      // The owner's own request comes back in owner mode; the preview drops what a visitor would not get.
      const visible = this.asVisitor()
        ? page.items.filter((i) => this.visibleToGuests(i))
        : page.items;
      const list = this.sections()[part.key]?.items ?? [];
      const items = [
        ...list,
        ...visible.filter((i) => !list.some((x) => x.video.id === i.video.id)),
      ];
      patch({
        items,
        total: this.asVisitor()
          ? items.length + (page.total - page.offset - page.items.length)
          : page.total,
      });
    } catch (e) {
      if (rethrow) throw e;
      if (generation === this.generation) this.error.set(errorText(e));
    } finally {
      if (generation === this.generation) patch({ loading: false });
    }
  }
}

/** What a part asks of the listing on top of the shelf's own filters. */
function partParams(part: ShelfPart) {
  return {
    ...(part.section ? { section: part.section } : {}),
    ...(part.categoryId ? { categoryId: part.categoryId } : {}),
    ...(part.flat ? { flat: true } : {}),
  };
}

function viewFrom(value: string | null): FirstView | null {
  return value === 'videos' || value === 'folders' ? value : null;
}

/**
 * Scrolls back to where the visitor was once the page is tall enough: the mosaic lays itself out a
 * frame or two after the tiles are in. Gives up after three seconds (the page stays where it is).
 */
function restoreScroll(y: number): () => void {
  const until = Date.now() + 3000;
  let frame = 0;
  const step = () => {
    if (document.documentElement.scrollHeight >= y + window.innerHeight || Date.now() > until)
      window.scrollTo({ top: y, behavior: 'instant' });
    else frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
