import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { PanelState } from '../../core/navigation/panels';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  Component,
  DestroyRef,
  Injector,
  type OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCloudUpload,
  lucideEye,
  lucideEyeOff,
  lucideFolder,
  lucideFolderInput,
  lucideFolderMinus,
  lucideFolderUp,
  lucideGlobe,
  lucideGroup,
  lucideImage,
  lucideLayers,
  lucideLayoutGrid,
  lucideLink,
  lucideLink2,
  lucideList,
  lucideListChecks,
  lucideSquareCheckBig,
  lucideArrowLeftRight,
  lucideLock,
  lucidePencil,
  lucidePlay,
  lucideScissors,
  lucideShield,
  lucideShieldAlert,
  lucideSquareArrowOutUpRight,
  lucideTextCursorInput,
  lucideTrash2,
  lucideUngroup,
  lucideUpload,
  lucideX,
  lucideSparkles,
  lucidePin,
  lucidePinOff,
  lucideTable2,
  lucideArrowUp,
  lucideArrowDown,
} from '@ng-icons/lucide';

import {
  type CollectionItemDto,
  type CollectionSort,
  type FeaturedDto,
  type ListSort,
  type PageLayout,
  type SortDirection,
  type Visibility,
  Api,
  collectionFeatured,
  myCollectionSetFeatured,
  usersUpdatePageSettings,
  type StackDto,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { SiteConfig } from '../../core/site/site-config';
import { CategoriesStore } from '../../core/categories/categories.store';
import { SensitiveContentService } from '../../core/content/sensitive.service';
import { VideoMorph } from '../../core/navigation/video-morph';
import { type UploadGroup, UploadStore } from '../../core/upload/upload.store';
import { VideosStore } from '../../core/videos/videos.store';
import { BytesPipe, formatBytes } from '../../shared/pipes/bytes.pipe';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { AutoMoreComponent } from '../../shared/ui/auto-more/auto-more';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { EmptyStateComponent } from '../../shared/ui/empty/empty-state';
import { SEARCH_FROM, ShelfSearchComponent } from '../../shared/collection/shelf-search';
import { SHELF_SEARCH_MAX } from '../../shared/forms/limits';
import { type FolderMenuItem } from '../../shared/collection/shelf-folder-menu';
import { bucketAtTop, scrollToBucket } from '../../shared/collection/bucket-scroll';
import { SCROLLER_FROM, ShelfScrollerComponent } from '../../shared/collection/shelf-scroller';
import {
  type SlotGroup,
  groupByMonth,
  monthLabel,
  videosBefore,
} from '../../shared/collection/slot-groups';
import { ShelfStickyBarComponent } from '../../shared/collection/shelf-sticky-bar';
import { ShelfStripComponent } from '../../shared/collection/shelf-strip';
import {
  ShelfZoom,
  ShelfZoomComponent,
  ShelfZoomGesturesDirective,
} from '../../shared/collection/shelf-zoom';
import { LibraryTrashComponent } from './library-trash';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { MosaicComponent } from '../../shared/ui/mosaic/mosaic';
import { aspectOf } from '../../shared/ui/mosaic/mosaic-layout';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import {
  type HoldingText,
  HoldingTextDialog,
  type HoldingTextDialogData,
} from '../videos/holding-text-dialog';
import { VideoEditDialog } from '../videos/video-edit-dialog';
import { LibraryIndexComponent } from './library-index';
import { DuplicatesDialog } from './duplicates-dialog';
import { TitleCleanupService } from './title-cleanup-dialog';
import {
  type Folder,
  LibraryStore,
  folderFromParam,
  folderToParam,
  hasNewIds,
  MOVE_MAX,
} from './library.store';
import {
  type PickedFile,
  droppedEntries,
  groupOf,
  pickedFromInput,
  readEntries,
} from './folder-import';
import { LibraryTileComponent } from './library-tile';
import { type ClickModifiers } from './selection';
import { DragGhostComponent } from './drag-ghost';
import { type DragTarget, TileDragController } from './tile-drag';
import { StackCategoryPrompt } from './stack-category-dialog';
import { ExchangeLinks } from '../deals/exchange-links';
import { TemporaryLinks } from '../links/temporary-links';
import { StackSheet } from '../collection/stack-sheet';
import { StackTileComponent } from '../../shared/ui/stack-tile/stack-tile';
import {
  type Slot,
  toSlots,
  planStackCategory,
  slotAspect,
  slotCover,
  slotIds,
  slotKey,
  slotOf,
  stackPictures,
} from '../../shared/collection/slots';
import { NavigationHistory } from '../../core/navigation/navigation-history';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';
import { videoLink, videoState } from '../../core/navigation/user-links';
import { LayoutFrame } from '../../core/layout/frame';

/** Up to this many in the "Featured" strip (backend FEATURED_MAX). */
const FEATURED_MAX = 12;
/** Each order's own first way, as the server takes it (backend positions FIRST_WAY). */
const FIRST_WAY: Record<ListSort, SortDirection> = {
  added: 'desc',
  title: 'asc',
  manual: 'asc',
  duration: 'desc',
  size: 'desc',
  quality: 'desc',
  category: 'asc',
  visibility: 'asc',
};
const PAGE_SORTS: readonly string[] = ['added', 'title', 'manual'];
function isPageSort(sort: ListSort): sort is CollectionSort {
  return PAGE_SORTS.includes(sort);
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|mkv|avi|webm|wmv|ts|mts|m2ts|mpg|mpeg|flv|3gp|ogv)$/i;

/**
 * The owner's page as a file manager: folders, tiles (a click opens, Ctrl/Shift
 * select), context menu, drag and drop onto folders and manual order, a floating
 * bulk-actions dock that never pushes the shelf down, hotkeys, uploads by button or file drop.
 */

/** How long a finger rests on a tile before it is selected. */
const LONG_PRESS_MS = 450;
@Component({
  selector: 'app-library',
  imports: [
    DragGhostComponent,
    ShelfSearchComponent,
    ShelfStickyBarComponent,
    ShelfScrollerComponent,
    ShelfZoomComponent,
    ShelfZoomGesturesDirective,
    ShelfStripComponent,
    SelectComponent,
    OptionComponent,
    EmptyStateComponent,
    LibraryTrashComponent,
    TranslocoPipe,
    FormsModule,
    NgTemplateOutlet,
    NgIcon,
    BytesPipe,
    AlertComponent,
    AutoMoreComponent,
    ButtonDirective,
    ProgressBarComponent,
    SpinnerComponent,
    MosaicComponent,
    LibraryIndexComponent,
    LibraryTileComponent,
    StackTileComponent,
    CdkContextMenuTrigger,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
  ],
  providers: [
    LibraryStore,
    provideIcons({
      lucideSparkles,
      lucidePin,
      lucidePinOff,
      lucideTable2,
      lucideArrowUp,
      lucideArrowDown,
      lucideUpload,
      lucideFolderUp,
      lucideCloudUpload,
      lucideLayoutGrid,
      lucideList,
      lucideFolderInput,
      lucideX,
      lucideEye,
      lucideEyeOff,
      lucideFolder,
      lucideFolderMinus,
      lucideGlobe,
      lucideGroup,
      lucideImage,
      lucideLayers,
      lucideLink,
      lucideLink2,
      lucideListChecks,
      lucideSquareCheckBig,
      lucideArrowLeftRight,
      lucideLock,
      lucidePencil,
      lucidePlay,
      lucideScissors,
      lucideShield,
      lucideShieldAlert,
      lucideSquareArrowOutUpRight,
      lucideTextCursorInput,
      lucideTrash2,
      lucideUngroup,
    }),
  ],
  host: { class: 'block' },
  template: `
    <div #shelfControls>
      <app-library-index
        #index
        class="mb-10 block"
        [folder]="store.folder()"
        [summary]="store.summary()"
        [dropTarget]="drag.target()"
        (folderChange)="openFolder($event)"
        (duplicates)="openDuplicates()"
      >
        <span class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          @if (videos.quota(); as q) {
            @if (q.quotaBytes > 0) {
              <span class="label-mono flex items-center gap-2 whitespace-nowrap text-muted">
                {{
                  'videos.quota'
                    | transloco
                      : { used: q.usedBytes + q.reservedBytes | bytes, quota: q.quotaBytes | bytes }
                }}
                <app-progress-bar
                  class="hidden w-16 sm:block"
                  [label]="'a11y.quota' | transloco"
                  [value]="quotaPercent()"
                />
              </span>
            } @else {
              <!-- No shelf limit (a self-hosted instance by default): just what is used. -->
              <span class="label-mono whitespace-nowrap text-muted" data-testid="storage-used">
                {{ 'videos.used' | transloco: { used: q.usedBytes + q.reservedBytes | bytes } }}
              </span>
            }
          }
          @if (store.folder().kind !== 'TRASH') {
            <!-- A finger has no Ctrl, Shift or right button: picking several starts here. -->
            @if (coarsePointer() && !picking() && store.items().length) {
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                data-testid="pick-several"
                (click)="picking.set(true)"
              >
                {{ 'library.actions.selectSeveral' | transloco }}
              </button>
            }
            @if (store.folder().kind === 'INBOX' && store.items().length) {
              <!-- One by one, the Inbox sorted in a few clicks. -->
              <button
                type="button"
                appButton
                size="sm"
                data-testid="start-triage"
                (click)="triage()"
              >
                <ng-icon name="lucideSparkles" size="14" />{{ 'library.triage.start' | transloco }}
              </button>
            }
            @if (searchable()) {
              <app-shelf-search [value]="store.search()" (searched)="setSearch($event)" />
            }
            <!-- The table sorts by its columns' headers. -->
            <label
              class="label-mono flex items-center gap-1.5 whitespace-nowrap text-muted"
              [class.hidden]="layout() === 'list'"
            >
              <span class="sr-only">{{ 'library.sortLabel' | transloco }}</span>
              <!-- Quiet like the search beside it. -->
              <app-select
                size="sm"
                class="ts-quiet w-auto"
                [ngModel]="store.sort()"
                (ngModelChange)="setSort($event)"
                [attr.aria-label]="'library.sortLabel' | transloco"
              >
                @for (s of sorts; track s) {
                  <app-option [value]="s">{{ 'library.sort.' + s | transloco }}</app-option>
                }
              </app-select>
            </label>
            <div class="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5">
              @for (l of layouts; track l) {
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                  [class.bg-inverse]="layout() === l"
                  [class.text-on-inverse]="layout() === l"
                  [class.text-muted]="layout() !== l"
                  [attr.aria-label]="'library.layout.' + (l === 'list' ? 'table' : l) | transloco"
                  [attr.aria-pressed]="layout() === l"
                  [attr.data-testid]="'layout-' + l"
                  (click)="setLayout(l)"
                >
                  <ng-icon [name]="l === 'grid' ? 'lucideLayoutGrid' : 'lucideTable2'" size="14" />
                </button>
              }
            </div>
            @if (layout() === 'grid') {
              <app-shelf-zoom />
            }
          }
          <input
            #fileInput
            type="file"
            accept="video/*,.mkv,.avi,.mov,.wmv,.ts,.m4v,.webm,.mts,.m2ts,.flv,.3gp"
            multiple
            class="hidden"
            data-testid="upload-input"
            (change)="onFiles($event)"
          />
          <!-- A whole folder: its subfolders become stacks named after them. -->
          <input
            #folderInput
            type="file"
            webkitdirectory
            multiple
            class="hidden"
            data-testid="upload-folder-input"
            (change)="onFolder($event)"
          />
          <button
            type="button"
            appButton
            variant="ghost"
            size="sm"
            [disabled]="!verified()"
            [attr.title]="'videos.uploadFolderHint' | transloco"
            data-testid="upload-folder"
            (click)="folderInput.click()"
          >
            <ng-icon name="lucideFolderUp" size="14" />
            {{ 'videos.uploadFolder' | transloco }}
          </button>
          <button
            type="button"
            appButton
            size="sm"
            [disabled]="!verified()"
            [attr.title]="verified() ? null : ('auth.verify.bannerText' | transloco)"
            (click)="fileInput.click()"
          >
            <ng-icon name="lucideUpload" size="14" />
            {{ 'videos.upload' | transloco }}
          </button>
        </span>
      </app-library-index>
    </div>
    @if (store.folder().kind !== 'TRASH') {
      <app-shelf-sticky-bar
        [anchor]="shelfControls"
        [items]="index.menuItems()"
        [label]="stickyLabel(index.menuItems())"
        [count]="stickyCount(index.menuItems())"
        [search]="store.search()"
        [searchable]="searchable()"
        [zoomable]="layout() === 'grid'"
        (picked)="openFolder(folderFromParam($event || null))"
        (searched)="setSearch($event)"
      />
    }

    <section class="min-w-0">
      <h2 class="sr-only">{{ 'library.title' | transloco }}</h2>
      @if (store.folder().kind === 'TRASH') {
        <app-library-trash (restored)="store.reload()" />
      } @else {
        @if (store.error(); as error) {
          <div class="mb-4 flex flex-wrap items-center gap-3" data-testid="library-error">
            <app-alert kind="error" class="min-w-0 flex-1">{{ error }}</app-alert>
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              [disabled]="store.loading()"
              (click)="store.reload()"
            >
              {{ 'common.retry' | transloco }}
            </button>
          </div>
        }
        @if (!store.loaded()) {
          @if (!store.error()) {
            <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
          }
        } @else if (store.items().length === 0) {
          @if (store.search()) {
            <app-empty-state
              [text]="'collection.search.nothing' | transloco: { q: store.search() }"
              [seed]="27"
            />
          } @else if (store.folder().kind === 'ALL') {
            <!-- Not confirmed yet: uploads wait for it, the page says so instead of failing later. -->
            <app-empty-state
              [text]="(verified() ? 'videos.empty' : 'auth.verify.bannerText') | transloco"
              [seed]="21"
            >
              <button type="button" appButton [disabled]="!verified()" (click)="fileInput.click()">
                <ng-icon name="lucideUpload" size="16" />
                {{ 'videos.upload' | transloco }}
              </button>
              <!-- The browser extension, where the site that describes it is in front. -->
              @if (site.edition() === 'cloud' && site.siteUrl()) {
                <!-- No space between the two: Chinese and Japanese need none after their "？". -->
                <p class="mx-auto mt-5 max-w-md text-muted" data-testid="extension-hint">
                  {{ 'videos.extensionHint' | transloco
                  }}<a
                    class="ms-1 font-semibold text-text underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-text [&:lang(ja)]:ms-0 [&:lang(zh)]:ms-0"
                    [href]="site.siteUrl() + '/downloader'"
                    target="_blank"
                    rel="noopener"
                    >{{ 'videos.extensionLink' | transloco }}</a
                  >
                </p>
              }
            </app-empty-state>
          } @else {
            <app-empty-state [text]="'library.emptyFolder' | transloco" [seed]="25" />
          }
        } @else {
          @if (store.search() && store.folder().kind !== 'HIDDEN') {
            <p class="mb-4 text-sm text-muted" data-testid="search-scope">
              {{ 'collection.search.wholeShelf' | transloco: { count: store.total() } }}
            </p>
          }
          @if (featuredSlots().length) {
            <!-- On top of "All videos": pinned videos and stacks, dragged into order. -->
            <section class="mb-8" data-testid="featured">
              <h3
                class="mb-3 flex items-start font-display text-base leading-tight font-bold tracking-tight sm:text-lg"
              >
                {{ 'collection.featured.title' | transloco
                }}<sup class="index-count">{{ featuredSlots().length }}</sup>
              </h3>
              <app-shelf-strip
                [items]="featuredSlots()"
                [key]="slotKey"
                [aspect]="slotAspect"
                [count]="store.tileCount() ?? 0"
                [zoom]="zoom.factor()"
                [itemTemplate]="featuredTpl"
                [reorderable]="true"
                (reordered)="saveFeatured($event)"
              />
            </section>
          }
          @if (layout() === 'list') {
            <!-- The owner's table: a header that sorts by its columns. -->
            <div
              class="label-mono mb-1 flex items-center gap-3 border-b border-border px-2 pb-1.5 text-muted"
              data-testid="table-head"
            >
              <span class="w-20 shrink-0" aria-hidden="true"></span>
              @for (c of columns; track c.sort) {
                <button
                  type="button"
                  class="flex shrink-0 items-center gap-1 whitespace-nowrap transition-colors hover:text-text"
                  [class]="c.class"
                  [class.text-text]="store.sort() === c.sort"
                  [attr.aria-sort]="ariaSort(c.sort)"
                  [attr.data-testid]="'sort-' + c.sort"
                  (click)="sortBy(c.sort)"
                >
                  {{ 'library.table.' + c.sort | transloco }}
                  @if (store.sort() === c.sort) {
                    <ng-icon
                      [name]="way(c.sort) === 'asc' ? 'lucideArrowUp' : 'lucideArrowDown'"
                      size="12"
                    />
                  }
                </button>
              }
            </div>
          }
          <!-- Newest first, the shelf is cut by month with a heading each. -->
          @for (g of groups(); track g.key; let first = $first; let last = $last) {
            @if (g.key) {
              <h3
                class="mb-3 flex items-start font-display text-base leading-tight font-bold tracking-tight sm:text-lg"
                [class.mt-8]="!first"
                [attr.data-month]="g.key"
                data-testid="month-heading"
              >
                {{ monthTitle(g.key) }}<sup class="index-count">{{ monthCount(g) }}</sup>
              </h3>
            }
            @if (layout() === 'grid') {
              <app-mosaic
                appShelfZoomGestures
                [class.min-h-40]="first"
                role="group"
                tabindex="-1"
                [attr.aria-label]="g.key ? monthTitle(g.key) : ('library.title' | transloco)"
                [items]="g.slots"
                [key]="slotKey"
                [aspect]="slotAspect"
                [memoryKey]="layoutKey() + '|' + g.key"
                [count]="store.tileCount() ?? store.slots().length"
                [more]="last && store.hasMore()"
                [zoom]="zoom.factor()"
                [itemTemplate]="tileTpl"
                (backgroundClick)="store.clearSelection()"
                (keydown.escape)="store.clearSelection()"
              />
            } @else {
              <div
                class="flex flex-col gap-1.5"
                [class.min-h-40]="first"
                role="group"
                tabindex="-1"
                [attr.aria-label]="g.key ? monthTitle(g.key) : ('library.title' | transloco)"
                (click)="onBackgroundClick($event)"
                (keydown.escape)="store.clearSelection()"
              >
                @for (slot of g.slots; track slotKey(slot)) {
                  <ng-container *ngTemplateOutlet="tileTpl; context: { $implicit: slot }" />
                }
              </div>
            }
          }
          <app-auto-more
            class="mt-2"
            [more]="store.hasMore()"
            [count]="store.items().length"
            [busy]="store.loading()"
            [load]="loadMore"
          />
        }
      }
    </section>
    @if (scroller(); as sc) {
      <app-shelf-scroller
        [buckets]="sc.buckets"
        [by]="sc.by"
        [current]="atTop()"
        [lang]="lang()"
        (jump)="jumpTo($event)"
      />
    }

    <ng-template #contextMenu>
      <div
        cdkMenu
        class="flex w-56 flex-col rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-float"
        data-testid="context-menu"
      >
        @if (!picking()) {
          <!-- At the very top, a checkbox. -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="select-several"
            (click)="picking.set(true)"
          >
            <ng-icon name="lucideSquareCheckBig" size="15" class="shrink-0 text-muted" />{{
              'library.actions.selectSeveral' | transloco
            }}
          </button>
        }
        @if (single(); as item) {
          @if (item.source === 'AUTHOR') {
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              (click)="edit(item)"
            >
              <ng-icon name="lucidePencil" size="15" class="shrink-0 text-muted" />{{
                'library.actions.edit' | transloco
              }}
            </button>
            @if (canOfferEdit(item)) {
              <!-- Every author sees it; a Pro feature in the cloud, Free goes to /pro. -->
              <button
                cdkMenuItem
                type="button"
                class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
                data-testid="action-edit-video"
                (click)="editVideo(item)"
              >
                <ng-icon name="lucideScissors" size="15" class="shrink-0 text-muted" />{{
                  'library.actions.editVideo' | transloco
                }}
                @if (site.hasTiers()) {
                  <span
                    class="label-mono ml-auto shrink-0 rounded-full bg-inverse px-1.5 py-px text-[10px] font-semibold tracking-normal text-on-inverse"
                    aria-hidden="true"
                    data-testid="action-edit-video-pro"
                    >{{ 'common.tier.PREMIUM' | transloco }}</span
                  >
                }
              </button>
            }
          } @else {
            <!-- Someone else's video: only my own name for it on my shelf. -->
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              data-testid="action-own-name"
              (click)="ownName(item)"
            >
              <ng-icon name="lucideTextCursorInput" size="15" class="shrink-0 text-muted" />{{
                'library.actions.ownName' | transloco
              }}
            </button>
          }
        }
        @if (contextStack(); as stack) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            (click)="openStack(stack.id)"
          >
            <ng-icon name="lucideLayers" size="15" class="shrink-0 text-muted" />{{
              'stacks.open' | transloco
            }}
          </button>
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="unstack"
            (click)="unstack(stack.id)"
          >
            <ng-icon name="lucideUngroup" size="15" class="shrink-0 text-muted" />{{
              'stacks.unstack' | transloco
            }}
          </button>
        }
        @if (pinKey(); as key) {
          <!-- On top of "All videos" for everyone, up to twelve. -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="pin"
            (click)="togglePin(key)"
          >
            <ng-icon
              [name]="isPinned(key) ? 'lucidePinOff' : 'lucidePin'"
              size="15"
              class="shrink-0 text-muted"
            />{{ (isPinned(key) ? 'library.featured.unpin' : 'library.featured.pin') | transloco }}
          </button>
        }
        @if (categoryCoverCandidate(); as item) {
          <!-- The picture of the category's card in the "Folders" view. -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="category-cover"
            (click)="setCategoryCover(item)"
          >
            <ng-icon name="lucideImage" size="15" class="shrink-0 text-muted" />{{
              'library.categoryCover' | transloco
            }}
          </button>
        }
        @if (coverCandidate(); as item) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="set-cover"
            (click)="setCover(item.video.id)"
          >
            <ng-icon name="lucideImage" size="15" class="shrink-0 text-muted" />{{
              'stacks.setCover' | transloco
            }}
          </button>
        }
        @if (canStackSelection()) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="stack-together"
            (click)="stackSelected()"
          >
            <ng-icon name="lucideGroup" size="15" class="shrink-0 text-muted" />{{
              'stacks.together' | transloco
            }}
          </button>
        }
        @if (selectionInStacks() && !contextStack()) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="take-out"
            (click)="takeOutSelected()"
          >
            <ng-icon name="lucideSquareArrowOutUpRight" size="15" class="shrink-0 text-muted" />{{
              'stacks.takeOut' | transloco
            }}
          </button>
        }
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
          [cdkMenuTriggerFor]="moveMenu"
        >
          <ng-icon name="lucideFolderInput" size="15" class="shrink-0 text-muted" />{{
            'library.actions.moveTo' | transloco
          }}
          <span class="ml-auto" aria-hidden="true">›</span>
        </button>
        @if (store.selectedOwn().length) {
          @if (!allOwn('PUBLIC')) {
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              (click)="setVisibility('PUBLIC')"
            >
              <ng-icon name="lucideGlobe" size="15" class="shrink-0 text-muted" />{{
                'library.actions.makePublic' | transloco
              }}
            </button>
          }
          @if (!allOwn('PRIVATE')) {
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              (click)="setVisibility('PRIVATE')"
            >
              <ng-icon name="lucideLock" size="15" class="shrink-0 text-muted" />{{
                'library.actions.makePrivate' | transloco
              }}
            </button>
          }
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            (click)="setSensitive(!allSensitive())"
          >
            <ng-icon
              [name]="allSensitive() ? 'lucideShield' : 'lucideShieldAlert'"
              size="15"
              class="shrink-0 text-muted"
            />{{
              (allSensitive() ? 'library.actions.unmarkSensitive' : 'library.actions.markSensitive')
                | transloco
            }}
          </button>
        }
        @if (store.selectedItems().length) {
          <!-- own videos too: "only for me" -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            (click)="setHidden(anyVisible())"
          >
            <ng-icon
              [name]="anyVisible() ? 'lucideEyeOff' : 'lucideEye'"
              size="15"
              class="shrink-0 text-muted"
            />{{ (anyVisible() ? 'library.actions.hide' : 'library.actions.show') | transloco }}
          </button>
        }
        @if (single() || linkCandidates().length) {
          <!-- The only item about links: which link on hover — plain, temporary, for an exchange. -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            [cdkMenuTriggerFor]="linkMenu"
            data-testid="action-copy-link"
          >
            <ng-icon name="lucideLink" size="15" class="shrink-0 text-muted" />{{
              'library.actions.copyLink' | transloco
            }}
            <span class="ml-auto" aria-hidden="true">›</span>
          </button>
        }
        @if (store.selectedItems().length) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-danger hover:bg-surface-2"
            (click)="deleteSelected()"
          >
            <ng-icon name="lucideTrash2" size="15" class="shrink-0" />{{
              'library.actions.delete' | transloco
            }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #linkMenu>
      <div
        cdkMenu
        class="flex w-56 flex-col rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-float"
        data-testid="link-menu"
      >
        @if (single(); as item) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="action-copy-plain-link"
            (click)="copyLink(item)"
          >
            <ng-icon name="lucideLink" size="15" class="shrink-0 text-muted" />{{
              'library.links.plain' | transloco
            }}
          </button>
        }
        @if (linkCandidates().length) {
          <!-- A temporary link: its dialog, as before. -->
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="action-temporary-link"
            (click)="sendLink()"
          >
            <ng-icon name="lucideLink2" size="15" class="shrink-0 text-muted" />{{
              'library.links.temporary' | transloco
            }}
          </button>
        }
        @if (exchangeCandidates().length) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            data-testid="action-exchange-link"
            (click)="copyExchangeLink()"
          >
            <ng-icon name="lucideArrowLeftRight" size="15" class="shrink-0 text-muted" />{{
              'library.links.exchange' | transloco
            }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #moveMenu>
      <div
        cdkMenu
        #moveMenuRef="cdkMenu"
        class="flex max-h-80 w-56 flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-float"
        data-testid="move-menu"
      >
        @for (c of categories.items(); track c.id) {
          @if (stacksIn(c.id).length) {
            <!-- A category with stacks: its stacks on hover; the category itself on click. -->
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              [cdkMenuTriggerFor]="stackMenu"
              [cdkMenuTriggerData]="{ categoryId: c.id }"
              (click)="moveTo(c.id); moveMenuRef.menuStack.closeAll()"
            >
              <ng-icon name="lucideFolder" size="15" class="shrink-0 text-muted" /><span
                class="min-w-0 flex-1 truncate"
                >{{ c.name }}</span
              ><span class="text-muted" aria-hidden="true">›</span>
            </button>
          } @else {
            <button
              cdkMenuItem
              type="button"
              class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
              (click)="moveTo(c.id)"
            >
              <ng-icon name="lucideFolder" size="15" class="shrink-0 text-muted" /><span
                class="truncate"
                >{{ c.name }}</span
              >
            </button>
          }
        }
        @if (stacksIn(null).length) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2 text-muted"
            [cdkMenuTriggerFor]="stackMenu"
            [cdkMenuTriggerData]="{ categoryId: null }"
            (click)="moveTo(null); moveMenuRef.menuStack.closeAll()"
          >
            <ng-icon name="lucideFolderMinus" size="15" class="shrink-0 text-muted" /><span
              class="flex-1"
              >{{ 'library.actions.noCategory' | transloco }}</span
            ><span aria-hidden="true">›</span>
          </button>
        } @else {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2 text-muted"
            (click)="moveTo(null)"
          >
            <ng-icon name="lucideFolderMinus" size="15" class="shrink-0 text-muted" />{{
              'library.actions.noCategory' | transloco
            }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #stackMenu let-categoryId="categoryId">
      <div
        cdkMenu
        class="flex max-h-80 w-56 flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-float"
        data-testid="stack-menu"
      >
        @for (st of stacksIn(categoryId); track st.id) {
          <button
            cdkMenuItem
            type="button"
            class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
            (click)="moveToStack(st)"
          >
            <ng-icon name="lucideLayers" size="15" class="shrink-0 text-muted" /><span
              class="min-w-0 flex-1 truncate"
              >{{ st.name || ('stacks.stack' | transloco) }}</span
            ><span class="font-mono text-[11px] text-muted">{{ st.size }}</span>
          </button>
        }
      </div>
    </ng-template>

    @if (store.selectedIds().length; as count) {
      <div
        class="fixed bottom-5 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl bg-inverse py-2 pr-2 pl-4 text-sm text-on-inverse shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)]"
        role="toolbar"
        [attr.aria-label]="'library.selected' | transloco: { count }"
        data-testid="bulk-bar"
        animate.enter="dock-in"
        animate.leave="dock-out"
      >
        <span class="mr-1 font-semibold whitespace-nowrap">{{
          'library.selected' | transloco: { count }
        }}</span>
        <button
          type="button"
          appButton
          size="sm"
          variant="inverse"
          [cdkMenuTriggerFor]="moveMenu"
          (cdkMenuOpened)="store.loadStacks()"
        >
          <ng-icon name="lucideFolderInput" size="14" />{{ 'library.actions.moveTo' | transloco }}
        </button>
        @if (canStackSelection()) {
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            data-testid="bulk-stack"
            (click)="stackSelected()"
          >
            <ng-icon name="lucideGroup" size="14" />{{ 'stacks.together' | transloco }}
          </button>
        }
        @if (selectionInStacks()) {
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            data-testid="bulk-take-out"
            (click)="takeOutSelected()"
          >
            <ng-icon name="lucideSquareArrowOutUpRight" size="14" />{{
              'stacks.takeOut' | transloco
            }}
          </button>
        }
        <!-- Tidier titles for the picked ones at once. -->
        <button
          type="button"
          appButton
          size="sm"
          variant="inverse"
          data-testid="bulk-titles"
          (click)="cleanTitles()"
        >
          <ng-icon name="lucideSparkles" size="14" />{{ 'library.cleanup.button' | transloco }}
        </button>
        @if (linkCandidates().length) {
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            data-testid="bulk-temporary-link"
            (click)="sendLink()"
          >
            <ng-icon name="lucideLink2" size="14" />{{ 'links.action' | transloco }}
          </button>
        }
        @if (store.selectedOwn().length) {
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            (click)="setVisibility('PUBLIC')"
          >
            <ng-icon name="lucideGlobe" size="14" />{{ 'library.actions.makePublic' | transloco }}
          </button>
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            (click)="setVisibility('PRIVATE')"
          >
            <ng-icon name="lucideLock" size="14" />{{ 'library.actions.makePrivate' | transloco }}
          </button>
        }
        @if (store.selectedItems().length) {
          <button
            type="button"
            appButton
            size="sm"
            variant="inverse"
            (click)="setHidden(anyVisible())"
          >
            <ng-icon [name]="anyVisible() ? 'lucideEyeOff' : 'lucideEye'" size="14" />{{
              (anyVisible() ? 'library.actions.hide' : 'library.actions.show') | transloco
            }}
          </button>
        }
        @if (store.selectedItems().length) {
          <button type="button" appButton size="sm" variant="danger" (click)="deleteSelected()">
            <ng-icon name="lucideTrash2" size="14" />{{ 'library.actions.delete' | transloco }}
          </button>
        }
        <button
          type="button"
          class="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-on-inverse/70 transition-colors hover:bg-on-inverse/15 hover:text-on-inverse"
          [attr.aria-label]="'library.clearSelection' | transloco"
          (click)="store.clearSelection()"
        >
          <ng-icon name="lucideX" size="18" />
        </button>
      </div>
    }

    <!-- The card travels with the pointer: the picture, a little smaller and a
         little see-through, tilted; it shrinks further once a tile offers to take it into a stack.
         Several videos travel as one card with their count. -->
    <app-drag-ghost [drag]="drag" />
    @if (dragging()) {
      <div
        class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-canvas/85"
      >
        <div
          class="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line bg-surface px-12 py-10 font-display text-lg font-semibold shadow-hard"
        >
          <ng-icon name="lucideCloudUpload" size="40" class="text-accent" />
          {{ 'videos.dropHere' | transloco }}
        </div>
      </div>
    }

    <ng-template #tileTpl let-slot let-height="height">
      @if (slot.kind === 'stack') {
        <app-stack-tile
          role="button"
          tabindex="0"
          [attr.aria-label]="stackLabel(slot)"
          [attr.data-video-id]="slot.items[0].video.id"
          [attr.data-stack-id]="slot.id"
          [attr.data-tile-ids]="slotIds(slot).join(',')"
          [class]="stackHostClass(slot)"
          [items]="stackPictures(slot)"
          [size]="slot.size"
          [name]="slot.name"
          [layout]="layout()"
          [height]="height ?? null"
          [selected]="store.isSlotSelected(slot)"
          [armed]="armed(slot)"
          [cdkContextMenuTriggerFor]="contextMenu"
          [cdkContextMenuDisabled]="pressing()"
          (pointerdown)="onSlotPointerDown($event, slot)"
          (click)="onSlotClick($event, slot)"
          (keydown.enter)="$event.stopPropagation(); openStack(slot.id)"
          (keydown.space)="$event.preventDefault(); toggleSlot(slot)"
          (contextmenu)="store.contextClickSlot(slot); store.loadStacks()"
        />
      } @else {
        <app-library-tile
          [item]="slot.item"
          [context]="foundIn(slot.item)"
          [category]="layout() === 'list' ? categoryOf(slot.item) : null"
          [layout]="layout()"
          [height]="height ?? null"
          [selected]="store.isSelected(slot.item.video.id)"
          [dropBefore]="dropSide(slot)"
          [armed]="armed(slot)"
          [cover]="isCover(slot)"
          [cdkContextMenuTriggerFor]="contextMenu"
          [cdkContextMenuDisabled]="pressing()"
          (pointerdown)="onSlotPointerDown($event, slot)"
          (click)="onSlotClick($event, slot)"
          (keydown.enter)="$event.stopPropagation(); open(slot.item)"
          (keydown.space)="$event.preventDefault(); toggleSlot(slot)"
          (contextmenu)="store.contextClick(slot.item.video.id); store.loadStacks()"
        />
      }
    </ng-template>

    <!-- A tile of the "Featured" strip: opens on a click, unpins from its menu. -->
    <ng-template #featuredTpl let-slot let-height="height">
      @if (slot.kind === 'stack') {
        <app-stack-tile
          role="button"
          tabindex="0"
          class="group relative block cursor-pointer text-left outline-none select-none"
          [attr.aria-label]="stackLabel(slot)"
          [items]="stackPictures(slot)"
          [size]="slot.size"
          [name]="slot.name"
          [layout]="'grid'"
          [height]="height ?? null"
          [cdkContextMenuTriggerFor]="featuredMenu"
          [cdkContextMenuTriggerData]="{ key: slotKey(slot) }"
          (click)="openStack(slot.id)"
          (keydown.enter)="openStack(slot.id)"
        />
      } @else {
        <app-library-tile
          [item]="slot.item"
          [layout]="'grid'"
          [height]="height ?? null"
          [cdkContextMenuTriggerFor]="featuredMenu"
          [cdkContextMenuTriggerData]="{ key: slotKey(slot) }"
          (click)="open(slot.item)"
          (keydown.enter)="open(slot.item)"
        />
      }
    </ng-template>
    <ng-template #featuredMenu let-key="key">
      <div
        cdkMenu
        class="flex w-56 flex-col rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-float"
        data-testid="featured-menu"
      >
        <button
          cdkMenuItem
          type="button"
          class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-left hover:bg-surface-2"
          data-testid="unpin"
          (click)="togglePin(key)"
        >
          <ng-icon name="lucidePinOff" size="15" class="shrink-0 text-muted" />{{
            'library.featured.unpin' | transloco
          }}
        </button>
      </div>
    </ng-template>

    <!-- The open stack's videos, drawn inside its window (a dialog, see StackSheet). -->
    <ng-template #stackContent>
      @if (layout() === 'grid') {
        <app-mosaic
          class="block min-h-40"
          [items]="stackSlots()"
          [key]="slotKey"
          [aspect]="slotAspect"
          [count]="stackSizing()"
          [itemTemplate]="tileTpl"
          (backgroundClick)="store.clearSelection()"
        />
      } @else {
        <div class="flex flex-col gap-1.5">
          @for (slot of stackSlots(); track slotKey(slot)) {
            <ng-container *ngTemplateOutlet="tileTpl; context: { $implicit: slot }" />
          }
        </div>
      }
    </ng-template>
  `,
})
export class LibraryComponent implements OnDestroy {
  protected readonly store = inject(LibraryStore);
  private readonly api = inject(Api);
  protected readonly videos = inject(VideosStore);
  protected readonly categories = inject(CategoriesStore);
  private readonly uploads = inject(UploadStore);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);
  private readonly panel = inject(PanelState);
  private readonly router = inject(Router);
  protected readonly site = inject(SiteConfig);
  private readonly temporaryLinks = inject(TemporaryLinks);
  private readonly exchangeLinks = inject(ExchangeLinks);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly history = inject(NavigationHistory);
  private readonly stackPrompt = inject(StackCategoryPrompt);
  private readonly stackSheet = inject(StackSheet);
  private readonly stackContent = viewChild.required<TemplateRef<unknown>>('stackContent');
  private sheetRef: DialogRef<void> | null = null;
  private readonly morph = inject(VideoMorph);
  private readonly sensitive = inject(SensitiveContentService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly clipboard = inject(ClipboardService);
  private readonly t = inject(TranslocoService);
  private dragDepth = 0;

  readonly username = input.required<string>();

  protected readonly drag = new TileDragController();
  protected readonly sorts: CollectionSort[] = ['added', 'title', 'manual'];
  protected readonly layouts: PageLayout[] = ['grid', 'list'];
  protected readonly layout = signal<PageLayout>(this.auth.user()?.pageSettings.layout ?? 'grid');
  private readonly titleCleanup = inject(TitleCleanupService);
  private readonly duplicatesDialog = inject(DuplicatesDialog);
  private readonly injector = inject(Injector);
  /** The viewer's tile size, the same as on any shelf they open. */
  protected readonly zoom = inject(ShelfZoom);
  protected readonly folderFromParam = folderFromParam;
  protected readonly dragging = signal(false);
  /** "Select several" from the context menu: clicks select until the selection is cleared. */
  protected readonly picking = signal(false);
  /** Uploads wait for a confirmed email. */
  protected readonly verified = computed(() => this.auth.user()?.emailVerified !== false);
  /** A touch screen (or a pen): no modifiers, no right button. */
  protected readonly coarsePointer = signal(
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  );
  /** A finger is resting on a tile: its long press selects instead of the system's menu. */
  protected readonly pressing = signal(false);
  private press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  /** The click that ends a long press must not open the video it selected. */
  private swallowClick = false;
  protected readonly slotKey = slotKey;
  protected readonly slotAspect = slotAspect;
  /** This shelf as the mosaic remembers it for "Back". */
  protected readonly layoutKey = computed(
    () => `own|${this.username()}|${JSON.stringify(this.store.folder())}|${this.searchParam()}`,
  );
  protected readonly slotIds = slotIds;
  /** Newest first, no search: the shelf is cut by month. */
  private readonly monthly = computed(
    () =>
      this.store.sort() === 'added' && !this.store.search() && this.store.buckets()?.by === 'month',
  );
  protected readonly groups = computed<SlotGroup[]>(() => {
    const slots = this.store.slots();
    return this.monthly() ? groupByMonth(slots) : [{ key: '', slots }];
  });
  private readonly bucketCounts = computed(
    () => new Map((this.store.buckets()?.buckets ?? []).map((b) => [b.key, b.count])),
  );
  protected readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  /** The quick scroller on a long shelf: its marks, or null. */
  protected readonly scroller = computed(() => {
    const b = this.store.buckets();
    if (!b?.by || b.buckets.length < 2 || this.store.total() < SCROLLER_FROM) return null;
    return { by: b.by, buckets: b.buckets };
  });
  /** The month or letter at the top of the view, for the scroller's thumb. */
  protected readonly atTop = signal<string | null>(null);
  protected readonly stackPictures = stackPictures;
  /** The next page, as the end of the shelf comes near. */
  protected readonly loadMore = () => this.store.loadMore();
  /** The open stack's videos, one tile each (no stacks inside a stack). */
  protected readonly stackSlots = computed<Slot[]>(() =>
    this.store.stackItems().map((item) => ({ kind: 'video', item })),
  );
  /** Tiles in the window stay handy (never the showcase size two videos would get on a shelf). */
  protected readonly stackSizing = computed(() => Math.max(this.stackSlots().length, 8));
  protected readonly openStackName = computed(() => {
    const id = this.store.openStackId();
    const slot = this.store.slots().find((s) => s.kind === 'stack' && s.id === id);
    return this.store.stackItems()[0]?.stack?.name ?? (slot?.kind === 'stack' ? slot.name : null);
  });
  protected readonly openStackCategory = computed(() => {
    const categoryId = this.store.stackItems()[0]?.categoryId;
    return categoryId
      ? (this.categories.items().find((c) => c.id === categoryId)?.name ?? null)
      : null;
  });
  /** The selection is exactly one stack (its tile was right-clicked): the menu offers the stack's own actions. */
  protected readonly contextStack = computed(() => {
    const items = this.store.selectedItems();
    const id = items[0]?.stack?.id;
    if (!id || !items.every((i) => i.stack?.id === id)) return null;
    const slot = this.store.slots().find((s) => s.kind === 'stack' && s.id === id);
    return slot?.kind === 'stack' && slot.items.length === items.length ? slot : null;
  });
  protected readonly canStackSelection = computed(
    () => this.store.selectedIds().length >= 2 && !this.contextStack(),
  );
  protected readonly selectionInStacks = computed(() =>
    this.store.selectedItems().some((i) => i.stack && i.stack.size >= 2),
  );
  private readonly stackParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('stack'))),
    { initialValue: null },
  );
  private readonly folderParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('folder'))),
    { initialValue: null },
  );
  private readonly searchParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => (p.get('q') ?? '').slice(0, SHELF_SEARCH_MAX))),
    { initialValue: '' },
  );
  /** The search field shows on a shelf worth searching, and while a search is on. */
  protected readonly searchable = computed(() => {
    const s = this.store.summary();
    return !!this.store.search() || (!!s && s.all + s.hidden >= SEARCH_FROM);
  });
  protected readonly quotaPercent = computed(() => {
    const q = this.videos.quota();
    return q && q.quotaBytes > 0 ? ((q.usedBytes + q.reservedBytes) / q.quotaBytes) * 100 : 0;
  });
  protected readonly single = computed(() => {
    const items = this.store.selectedItems();
    return items.length === 1 ? items[0]! : null;
  });
  protected readonly anyVisible = computed(() => this.store.selectedItems().some((i) => !i.hidden));
  protected readonly allSensitive = computed(() =>
    this.store.selectedOwn().every((i) => i.video.sensitive),
  );
  /**
   * Ids of finished uploads as one string: the effect below then re-runs only when that set changes,
   * not on every progress tick of an upload still running (those tick many times a second).
   */
  private readonly finishedUploads = computed(() =>
    this.uploads
      .items()
      .filter((i) => i.status === 'done')
      .map((i) => i.id)
      .join(','),
  );

  constructor() {
    // The footer waits under the shelf until it is in (a layout shift otherwise).
    inject(LayoutFrame).holdFooterWhile(
      () => !this.store.error() && (!this.store.loaded() || this.store.hasMore()),
    );
    // The page's document listeners by hand: as host bindings, every key pressed anywhere on the
    // page and each dragover (about twenty a second) re-checked the page and all its tiles (audit).
    // What they set is signals, which redraw just what reads them.
    const listeners: [string, (e: Event) => void][] = [
      ['keydown', (e) => this.onKeydown(e as KeyboardEvent)],
      ['click', (e) => this.onPageClick(e as MouseEvent)],
      ['dragenter', (e) => this.onDragEnter(e as DragEvent)],
      ['dragover', (e) => this.onDragOver(e as DragEvent)],
      ['dragleave', (e) => this.onDragLeave(e as DragEvent)],
      ['drop', (e) => this.onDrop(e as DragEvent)],
    ];
    for (const [type, listener] of listeners) document.addEventListener(type, listener);
    // Scrolling too, on the window and passive: as a host binding, every scrolled frame re-checked
    // the page and every tile of the shelf, 50–100 ms a frame at tens of thousands of videos.
    const onScroll = () => this.spyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      for (const [type, listener] of listeners) document.removeEventListener(type, listener);
      window.removeEventListener('scroll', onScroll);
    });
    effect(() => {
      if (this.store.selectedIds().length === 0) untracked(() => this.picking.set(false));
    });
    effect(() => {
      const username = this.username();
      untracked(() =>
        this.store.init(
          username,
          this.auth.user()?.pageSettings.sort ?? 'added',
          // The folder lives in the address: a reload opens the same one; the search too.
          folderFromParam(this.route.snapshot.queryParamMap.get('folder')),
          this.route.snapshot.queryParamMap.get('q') ?? '',
        ),
      );
    });
    effect(() => {
      const search = this.searchParam();
      untracked(() => this.store.setSearch(search));
    });
    // The strip follows the shelf: a video deleted or a stack undone leaves it.
    effect(() => {
      this.store.summary();
      untracked(() => void this.loadFeatured());
    });
    // The address is the folder's source of truth after that: the header's link to the shelf
    // (no `?folder=`) opens "All", and a folder picked here is already in the store (openFolder).
    effect(() => {
      const folder = folderFromParam(this.folderParam());
      untracked(() => this.store.setFolder(folder));
    });
    // A newly finished upload becomes a QUEUED video: fetch the folder again so the tile appears.
    // Uploads finished before this page opened are already in the first fetch.
    let seen = new Set(idsOf(this.finishedUploads()));
    effect(() => {
      const done = idsOf(this.finishedUploads());
      const fresh = hasNewIds(seen, done);
      seen = new Set(done);
      if (fresh) untracked(() => this.store.onUploaded());
    });
    // The open stack lives in the address (?stack=…), so the back button closes it and a link opens it.
    effect(() => {
      const id = this.stackParam();
      untracked(() => (id ? this.store.openStack(id) : this.store.closeStack()));
    });
    effect(() => {
      const id = this.store.openStackId();
      untracked(() => {
        if (!id) {
          this.sheetRef?.close();
          this.sheetRef = null;
        } else if (!this.sheetRef) {
          this.sheetRef = this.stackSheet.open({
            name: this.openStackName,
            size: computed(() => this.store.stackItems().length),
            category: this.openStackCategory,
            owner: true,
            fromStackId: id,
            dropOut: computed(() => this.drag.target()?.type === 'out'),
            content: this.stackContent(),
            onClose: () => this.closeStack(),
            onRename: (name) => this.renameStack(id, name),
            onUnstack: () => this.unstack(id),
          });
        }
      });
    });
    if (!this.videos.loaded()) void this.videos.reloadQuota();
  }

  ngOnDestroy(): void {
    this.drag.cancel();
    this.sheetRef?.close();
    this.store.destroy();
  }

  protected allOwn(visibility: Visibility): boolean {
    return this.store.selectedOwn().every((i) => i.video.visibility === visibility);
  }

  // --- what the page remembers ------------------------------

  /** The folder goes into the address, replacing it: a reload opens the same folder, back is not spammed. */
  protected setSearch(search: string): void {
    this.store.setSearch(search);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: search || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected openFolder(folder: Folder): void {
    this.store.setFolder(folder);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { folder: folderToParam(folder) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** The sort and the layout are the page's settings: a change here is kept like one made in Settings. */
  protected setSort(sort: CollectionSort): void {
    this.store.setSort(sort);
    this.rememberPageSettings({ sort });
  }

  protected monthTitle(key: string): string {
    return monthLabel(key, this.lang());
  }

  /** A month's videos as the server counts them; until it has, the tiles shown. */
  protected monthCount(group: SlotGroup): number {
    return this.bucketCounts().get(group.key) ?? group.slots.length;
  }

  /** The scroller let go on a month or letter: load that far, then go there. */
  protected async jumpTo(key: string): Promise<void> {
    const sc = this.scroller();
    if (!sc) return;
    await this.store.loadUntil(videosBefore(sc.buckets, key) + 1);
    if (await scrollToBucket(key, sc.by, this.store.slots())) this.atTop.set(key);
  }

  private spyFrame = 0;
  private spyScroll(): void {
    if (this.spyFrame || !this.scroller()) return;
    this.spyFrame = requestAnimationFrame(() => {
      this.spyFrame = 0;
      const sc = this.scroller();
      if (sc) this.atTop.set(bucketAtTop(this.store.slots(), sc.by));
    });
  }

  /**
   * The Inbox one by one; the shelf comes again after. Loaded when asked for: with its
   * player it was half of the shelf's code, hls.js included, for a button pressed now and then.
   */
  protected async triage(): Promise<void> {
    const { InboxTriage } = await import('./inbox-triage');
    if (await this.injector.get(InboxTriage).open(this.username(), this.injector)) {
      void this.categories.load();
      await this.store.reload();
    }
  }

  /** Tidier titles for the picked videos. */
  protected async cleanTitles(): Promise<void> {
    const videos = this.store
      .selectedItems()
      .map((i) => ({ id: i.video.id, title: i.video.title }));
    if (videos.length && (await this.titleCleanup.open(videos))) await this.store.reload();
  }

  protected async openDuplicates(): Promise<void> {
    if (await this.duplicatesDialog.open(this.injector)) await this.store.reload();
  }

  /** Where a search over the whole shelf found the video: its category. */
  protected foundIn(item: CollectionItemDto): string | null {
    if (!this.store.search() || !item.categoryId) return null;
    return this.categories.items().find((c) => c.id === item.categoryId)?.name ?? null;
  }

  /** The compact bar names the open folder. */
  protected stickyLabel(items: FolderMenuItem[]): string {
    return items.find((f) => f.current)?.label ?? this.t.translate('library.folders.ALL');
  }

  protected stickyCount(items: FolderMenuItem[]): number | null {
    return items.find((f) => f.current)?.count ?? null;
  }

  protected setLayout(layout: PageLayout): void {
    this.layout.set(layout);
    this.rememberPageSettings({ layout });
    // The grid sorts by the page's own orders only: a table column's order goes with the table.
    const sort = this.store.sort();
    if (layout === 'grid' && (!isPageSort(sort) || this.store.dir()))
      this.store.setSort(
        isPageSort(sort) ? sort : (this.auth.user()?.pageSettings.sort ?? 'added'),
      );
  }

  /** The table's columns, each with where it shows. */
  protected readonly columns: { sort: ListSort; class: string }[] = [
    { sort: 'title', class: 'min-w-0 flex-1 shrink' },
    { sort: 'category', class: 'hidden w-32 lg:flex' },
    { sort: 'quality', class: 'hidden w-14 md:flex' },
    { sort: 'added', class: 'hidden w-28 sm:flex' },
    { sort: 'size', class: 'hidden w-20 justify-end sm:flex' },
    { sort: 'duration', class: 'w-16 justify-end' },
    { sort: 'visibility', class: 'w-20 justify-end' },
  ];

  /** The way a column's order goes now. */
  protected way(sort: ListSort): SortDirection {
    return this.store.sort() === sort ? (this.store.dir() ?? FIRST_WAY[sort]) : FIRST_WAY[sort];
  }

  protected ariaSort(sort: ListSort): 'ascending' | 'descending' | null {
    if (this.store.sort() !== sort) return null;
    return this.way(sort) === 'asc' ? 'ascending' : 'descending';
  }

  /** A header clicked: its column's order, or the other way when it is the order already. */
  protected sortBy(sort: ListSort): void {
    if (this.store.sort() !== sort) this.store.setSort(sort);
    else this.store.setSort(sort, this.way(sort) === 'asc' ? 'desc' : 'asc');
  }

  protected categoryOf(item: CollectionItemDto): string | null {
    if (!item.categoryId) return null;
    return this.categories.items().find((c) => c.id === item.categoryId)?.name ?? null;
  }

  // --- the "Featured" strip -------------------------------------------

  private readonly featured = signal<FeaturedDto | null>(null);
  protected readonly featuredSlots = computed<Slot[]>(() => {
    const f = this.featured();
    if (!f || this.store.folder().kind !== 'ALL' || this.store.search()) return [];
    const at = (slot: Slot) => {
      const i = f.order.indexOf(slotKey(slot));
      return i < 0 ? f.order.length : i;
    };
    return toSlots(f.items).sort((a, b) => at(a) - at(b));
  });
  /** What the menu pins: the one video, or the stack whose tile it was opened on. */
  protected readonly pinKey = computed(() => {
    const stack = this.contextStack();
    if (stack) return `stack:${stack.id}`;
    const item = this.single();
    if (!item || item.hidden || this.store.openStackId()) return null;
    return `video:${item.video.id}`;
  });

  protected isPinned(key: string): boolean {
    return this.featured()?.order.includes(key) ?? false;
  }

  protected async loadFeatured(): Promise<void> {
    try {
      this.featured.set(await this.api.invoke(collectionFeatured, { username: this.username() }));
    } catch {
      // the strip stays as it was
    }
  }

  protected togglePin(key: string): void {
    const order = this.featured()?.order ?? [];
    if (order.includes(key)) {
      void this.saveFeatured(order.filter((k) => k !== key));
      return;
    }
    if (order.length >= FEATURED_MAX) {
      this.toast.error(this.t.translate('library.featured.full', { max: FEATURED_MAX }));
      return;
    }
    void this.saveFeatured([...order, key], true);
  }

  /** The strip in its new order: drawn at once, saved, and fetched again. */
  protected async saveFeatured(keys: string[], pinned = false): Promise<void> {
    const before = this.featured();
    if (before) this.featured.set({ ...before, order: keys });
    try {
      await this.api.invoke(myCollectionSetFeatured, { body: { keys } });
      if (pinned) this.toast.success(this.t.translate('library.featured.pinned'));
      await this.loadFeatured();
    } catch (e) {
      this.featured.set(before);
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  /** In a category, its one picked video that is not the card's picture yet. */
  protected readonly categoryCoverCandidate = computed(() => {
    const folder = this.store.folder();
    const item = this.single();
    if (folder.kind !== 'CATEGORY' || !item || item.categoryId !== folder.id) return null;
    if (!item.video.thumbnailUrl || this.store.openStackId()) return null;
    const category = this.categories.items().find((c) => c.id === folder.id);
    return category && category.coverVideoId !== item.video.id ? item : null;
  });

  protected setCategoryCover(item: CollectionItemDto): void {
    if (!item.categoryId) return;
    const id = item.categoryId;
    void this.run(async () => {
      await this.categories.update(id, { coverVideoId: item.video.id });
      this.toast.success(this.t.translate('library.categoryCoverSet'));
    });
  }

  /**
   * The first drag under another sort made the shelf manual; the server saved it, and the
   * signed-in user is told so too: back on this page, the shelf opened with the old sort.
   */
  private turnedManual(): void {
    this.toast.success(this.t.translate('library.manualOrderOn'));
    const me = this.auth.user();
    if (me && me.pageSettings.sort !== 'manual')
      this.auth.setUser({ ...me, pageSettings: { ...me.pageSettings, sort: 'manual' } });
  }

  private rememberPageSettings(patch: { sort?: CollectionSort; layout?: PageLayout }): void {
    void this.api
      .invoke(usersUpdatePageSettings, { body: patch })
      .then((me) => this.auth.setUser(me))
      .catch(() => undefined);
  }

  protected dropSide(slot: Slot): 'before' | 'after' | null {
    const t = this.drag.target();
    if (!t || t.type !== 'tile' || !slotIds(slot).includes(t.id)) return null;
    return t.after ? 'after' : 'before';
  }

  /** A drag rests on this tile: dropping stacks. */
  protected armed(slot: Slot): boolean {
    const t = this.drag.target();
    return t?.type === 'into' && slotIds(slot).includes(t.id);
  }

  protected stackHostClass(slot: Slot): string {
    const side = this.dropSide(slot);
    const list = this.layout() === 'list';
    const base = 'group relative cursor-pointer select-none text-left outline-none ';
    const shape = list
      ? 'flex items-center gap-3 rounded-md border px-2 py-1.5 transition-colors hover:bg-surface-2 focus-visible:border-line ' +
        (this.store.isSlotSelected(slot) ? 'border-accent bg-accent-soft ' : 'border-transparent ')
      : 'block ';
    const drop =
      side === 'before'
        ? 'before:absolute before:inset-y-0 before:-left-[6px] before:z-10 before:w-[3px] before:bg-accent before:content-[""] '
        : side === 'after'
          ? 'after:absolute after:inset-y-0 after:-right-[6px] after:z-10 after:w-[3px] after:bg-accent after:content-[""] '
          : '';
    return base + shape + drop;
  }

  /** Inside the open stack: the video on its cover. */
  protected isCover(slot: Slot): boolean {
    const id = this.store.openStackId();
    if (!id || slot.kind !== 'video') return false;
    const items = this.store.stackItems();
    const coverId = items[0]?.stack?.coverVideoId ?? null;
    const cover = items.find((i) => i.video.id === coverId) ?? items[0];
    return cover?.video.id === slot.item.video.id;
  }

  /** The one video selected inside the open stack that is not its cover yet. */
  protected readonly coverCandidate = computed(() => {
    const item = this.single();
    const id = this.store.openStackId();
    if (!item || !id || item.stack?.id !== id) return null;
    return this.isCover({ kind: 'video', item }) ? null : item;
  });

  protected setCover(videoId: string): void {
    const id = this.store.openStackId();
    if (!id) return;
    void this.run(async () => {
      await this.store.setCover(id, videoId);
      this.toast.success(this.t.translate('stacks.coverSet'));
    });
  }

  protected stackLabel(slot: Extract<Slot, { kind: 'stack' }>): string {
    return this.t.translate('stacks.tileLabel', {
      name: slot.name ?? this.t.translate('stacks.stack'),
      count: slot.size,
    });
  }

  // --- pointer / selection ---------------------------------------------------

  protected onSlotPointerDown(e: PointerEvent, slot: Slot): void {
    // Select before the context menu opens: the CDK positions the menu as soon as it opens, and a
    // menu that grows afterwards (one item → all actions for the tile) would run off the screen.
    if (e.button === 2) {
      this.store.contextClickSlot(slot);
      return;
    }
    if (e.pointerType === 'touch') return this.startPress(e, slot);
    const ids = this.store.isSlotSelected(slot) ? this.store.selectedIds() : slotIds(slot);
    const cover = slotCover(slot);
    const picture = (e.currentTarget as HTMLElement | null)?.querySelector('[data-morph]');
    this.drag.begin(e, {
      ids,
      layout: this.layout(),
      preview: {
        url: cover.video.thumbnailUrl,
        aspect: slotAspect(slot),
        width: picture?.getBoundingClientRect().width ?? 240,
      },
      // Dropping between tiles always reorders: under another sort the shelf turns manual.
      reorderable: true,
      // Inside an open stack there is nothing to stack onto: only reorder, or drag out.
      stackable: !this.store.openStackId(),
      onDrop: (target, dragged) => void this.onTileDrop(target, dragged),
    });
  }

  /**
   * A finger resting on a tile (LONG_PRESS_MS, the stack's pause) selects it and starts
   * picking several, the way Ctrl does with a mouse. Moving the finger (scrolling) cancels.
   */
  private startPress(e: PointerEvent, slot: Slot): void {
    this.endPress();
    this.pressing.set(true);
    const timer = setTimeout(() => {
      this.press = null;
      this.swallowClick = true;
      this.picking.set(true);
      if (!this.store.isSlotSelected(slot))
        this.store.clickSlot(slot, { ctrl: true, shift: false });
      navigator.vibrate?.(10);
      // the system menu of a long press stays off a moment longer: it comes when the finger lifts
      setTimeout(() => this.pressing.set(false), 800);
    }, LONG_PRESS_MS);
    this.press = { timer, x: e.clientX, y: e.clientY };
    const move = (m: PointerEvent) => {
      if (this.press && Math.hypot(m.clientX - this.press.x, m.clientY - this.press.y) > 10)
        this.endPress();
    };
    const up = () => {
      if (this.press) this.endPress();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private endPress(): void {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
    this.pressing.set(false);
  }

  /** A plain click opens the video or the stack; Ctrl/Cmd or Shift select instead. */
  protected onSlotClick(e: MouseEvent, slot: Slot): void {
    e.stopPropagation();
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    const mods: ClickModifiers = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    // Picking several (from the context menu): a plain click adds or takes out, Shift still spans.
    if (this.picking() && !mods.shift) this.store.clickSlot(slot, { ctrl: true, shift: false });
    else if (mods.ctrl || mods.shift) this.store.clickSlot(slot, mods);
    else if (slot.kind === 'stack') this.openStack(slot.id);
    else this.open(slot.item);
  }

  /** Space on a focused tile adds it to the selection or takes it out. */
  protected toggleSlot(slot: Slot): void {
    this.store.clickSlot(slot, { ctrl: true, shift: false });
  }

  protected onBackgroundClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.store.clearSelection();
  }

  /**
   * A click on nothing anywhere on the page — not a tile or a stack, not a control, a menu, a
   * dialog or the selection bar — lets go of the selection; a modifier key keeps it.
   */
  private onPageClick(e: MouseEvent): void {
    if (!this.store.selectedIds().length || e.button !== 0 || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as Element | null;
    // Gone by now: a menu item or a button that closed what it was in.
    if (!target?.isConnected) return;
    if (target.closest(KEEPS_SELECTION)) return;
    this.store.clearSelection();
  }

  private async onTileDrop(target: DragTarget, ids: string[]): Promise<void> {
    if (!target) return;
    // Stacked or taken out, the videos are not left selected: the tile they went into is what matters.
    // Otherwise the selection stays as it was: a tile that was only dragged is not selected by it,
    // only what was picked on purpose (Ctrl, Shift, "Select several") stays picked.
    if (target.type === 'into' || target.type === 'out') this.store.clearSelection();
    await this.run(async () => {
      switch (target.type) {
        case 'category':
          await this.store.moveToCategory(ids, target.id);
          this.toast.success(this.t.translate('library.moved'));
          break;
        case 'folder':
          if (target.kind === 'HIDDEN') await this.store.setHidden(ids, true);
          else await this.store.setVisibility(ids, target.kind);
          break;
        case 'tile': {
          // One drag's order is computed whole: more than the API takes is said, not refused.
          if (ids.length > MOVE_MAX) {
            this.toast.error(this.t.translate('library.tooManyToMove', { max: MOVE_MAX }));
            break;
          }
          if (this.store.openStackId()) {
            if (await this.store.reorderWithin(ids, target.id, target.after)) this.turnedManual();
            break;
          }
          // Before a stack means before its first video, after it means after its last.
          const slot = slotOf(this.store.slots(), target.id);
          const edge = slot ? slotIds(slot) : [target.id];
          const anchor = target.after ? edge[edge.length - 1]! : edge[0]!;
          if (await this.store.moveTo(ids, this.store.stacksIn(ids), anchor, target.after))
            this.turnedManual();
          break;
        }
        case 'into':
          await this.stackInto(target, ids);
          break;
        case 'out':
          await this.takeOut(ids);
          break;
      }
    });
  }

  // --- stacks ----------------------------------------------

  /**
   * Stacks `ids` with the tile `target` (into its stack, or a new one with its video). A stack
   * keeps one category: the user is asked when a video would lose or change its category.
   */
  private async stackInto(
    target: { id: string; stackId: string | null },
    ids: string[],
  ): Promise<void> {
    const byId = new Map(this.store.items().map((i) => [i.video.id, i]));
    const targetItem = byId.get(target.id);
    const dragged = ids.filter(
      (id) => id !== target.id && !(target.stackId && byId.get(id)?.stack?.id === target.stackId),
    );
    if (!targetItem || dragged.length === 0) return;
    const plan = planStackCategory(
      targetItem.categoryId,
      dragged.map((id) => byId.get(id)?.categoryId ?? null),
    );
    let categoryId: string | null | undefined;
    if (plan.kind === 'auto') categoryId = plan.categoryId;
    if (plan.kind === 'ask') {
      const chosen = await this.stackPrompt.ask({
        choices: plan.options.map((id) => ({ id, name: this.categoryName(id) })),
        preselect: plan.preselect,
      });
      if (chosen === undefined) return;
      categoryId = chosen;
    }
    await this.run(async () => {
      await this.store.stackOnto(target, dragged, categoryId);
      this.toast.success(
        categoryId
          ? this.t.translate('stacks.stackedIn', { name: this.categoryName(categoryId) })
          : this.t.translate('stacks.stacked'),
      );
    });
  }

  private categoryName(id: string | null): string {
    return id
      ? (this.categories.items().find((c) => c.id === id)?.name ?? '')
      : this.t.translate('stacks.category.none');
  }

  /** "Stack together": the selected videos become one stack where the first of them sits. */
  protected async stackSelected(): Promise<void> {
    const ids = this.store.order().filter((id) => this.store.isSelected(id));
    if (ids.length < 2) return;
    const first = this.store.items().find((i) => i.video.id === ids[0]);
    const stackId = first?.stack && first.stack.size >= 2 ? first.stack.id : null;
    await this.stackInto({ id: ids[0]!, stackId }, ids.slice(1));
  }

  protected takeOutSelected(): Promise<void> {
    return this.takeOut(this.store.selectedIds());
  }

  private async takeOut(ids: string[]): Promise<void> {
    await this.run(async () => {
      const { dissolved } = await this.store.takeOut(ids);
      this.toast.success(this.t.translate(dissolved ? 'stacks.dissolved' : 'stacks.takenOut'));
      if (this.store.openStackId() && this.store.stackItems().length < 2) this.closeStack();
    });
  }

  protected unstack(stackId: string): void {
    void this.run(async () => {
      await this.store.unstack(stackId);
      this.toast.success(this.t.translate('stacks.unstacked'));
      if (this.stackParam() === stackId) this.closeStack();
    });
  }

  protected renameStack(stackId: string, name: string): void {
    void this.run(() => this.store.renameStack(stackId, name));
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

  // --- actions ---------------------------------------------------------------

  /**
   * Only a ready video opens: one still uploading or processing (or failed) has no player yet, and
   * its page looked like a stranger's preview. The tile says what is going on.
   */
  protected canOpen(item: CollectionItemDto): boolean {
    return item.video.status === 'READY';
  }

  protected open(item: CollectionItemDto): void {
    if (!this.canOpen(item)) return;
    this.openNow(item);
  }

  private openNow(item: CollectionItemDto): void {
    const picture = document.querySelector<HTMLElement>(
      `app-library-tile[data-video-id="${item.video.id}"] [data-morph]`,
    );
    this.morph.from(picture, {
      code: item.video.code,
      poster: item.video.thumbnailUrl,
      aspect: aspectOf(item.video.width, item.video.height),
    });
    void this.router.navigate(videoLink(item.video.code), { state: videoState(this.username()) });
  }

  protected ownName(item: CollectionItemDto): void {
    const ref = this.dialog.open<HoldingText>(HoldingTextDialog, {
      data: {
        videoId: item.video.id,
        title: item.originalTitle ? item.video.title : null,
        originalTitle: item.originalTitle ?? item.video.title,
        originalDescription: null,
      } satisfies HoldingTextDialogData,
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    ref.closed.subscribe((saved) => {
      if (saved) this.store.renamed(item.video.id, saved.title);
    });
  }

  /** The video editor: one's own ready video, on Pro where there are plans. */
  protected canEdit(item: CollectionItemDto): boolean {
    if (item.source !== 'AUTHOR' || item.video.status !== 'READY') return false;
    return (
      !this.site.hasTiers() || this.auth.isAdmin() || this.auth.user()?.plan.tier === 'PREMIUM'
    );
  }

  /** The editor for whoever may use it; Free in the cloud learns about Pro instead. */
  protected editVideo(item: CollectionItemDto): void {
    void this.router.navigate(this.canEdit(item) ? ['/edit', item.video.id] : ['/pro']);
  }

  /** "Edit video…" in the menu: every author of a ready video sees it. */
  protected canOfferEdit(item: CollectionItemDto): boolean {
    return item.source === 'AUTHOR' && item.video.status === 'READY';
  }

  protected edit(item: CollectionItemDto): void {
    const ref = this.dialog.open(VideoEditDialog, {
      data: { id: item.video.id, categoryId: item.categoryId },
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    ref.closed.subscribe((changed) => {
      if (changed) void this.store.reload();
    });
  }

  /** The owner's stacks in a category, for "Move to". */
  protected stacksIn(categoryId: string | null): StackDto[] {
    return this.store.stacks().filter((st) => st.categoryId === categoryId);
  }

  /** Into a stack straight from "Move to": the videos take its category. */
  protected moveToStack(stack: StackDto): void {
    void this.run(async () => {
      const ids = this.store.selectedIds();
      const member = this.store.items().find((i) => i.stack?.id === stack.id)?.video.id;
      await this.store.stackOnto(
        { id: member ?? ids[0]!, stackId: stack.id },
        ids,
        stack.categoryId,
      );
      this.toast.success(this.t.translate('library.movedToStack'));
    });
  }

  protected moveTo(categoryId: string | null): void {
    void this.run(async () => {
      await this.store.moveToCategory(this.store.selectedIds(), categoryId);
      this.toast.success(this.t.translate('library.moved'));
    });
  }

  protected setVisibility(visibility: Visibility): void {
    void this.run(() => this.store.setVisibility(this.store.selectedIds(), visibility));
  }

  protected setSensitive(sensitive: boolean): void {
    void this.run(() => this.store.setSensitive(this.store.selectedIds(), sensitive));
  }

  protected setHidden(hidden: boolean): void {
    void this.run(() => this.store.setHidden(this.store.selectedIds(), hidden));
  }

  /** Own videos are deleted for everyone; received ones only leave this shelf. */
  protected async deleteSelected(): Promise<void> {
    const own = this.store.selectedOwn();
    const received = this.store.selectedReceived();
    const count = own.length + received.length;
    if (count === 0) return;
    const ok = await this.confirm.confirm({
      title: this.t.translate(
        own.length ? 'library.confirmDeleteTitle' : 'library.confirmRemoveTitle',
        { count },
      ),
      message: this.t.translate(
        !own.length
          ? 'library.confirmRemoveText'
          : received.length
            ? 'library.confirmDeleteMixed'
            : 'library.confirmDeleteText',
      ),
      confirmLabel: this.t.translate('video.confirmDeleteYes'),
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      let done = 0;
      if (own.length) done += await this.store.deleteVideos(own.map((i) => i.video.id));
      if (received.length) done += await this.store.removeReceived(received.map((i) => i.video.id));
      this.toast.success(this.t.translate('library.deleted', { count: done }));
    });
  }

  /** What a temporary link may carry of the picked: uploads and copies, ready. */
  protected readonly linkCandidates = computed(
    () =>
      this.store
        .selectedItems()
        .filter((i) => i.source !== 'PUBLIC_ADD' && i.video.status === 'READY')
  );
  /** What an exchange link may offer: what a temporary link may carry, not hidden from visitors. */
  protected readonly exchangeCandidates = computed(() =>
    this.linkCandidates().filter((i) => !i.hidden),
  );

  /** "Copy link → For an exchange": the same videos give back the same link. */
  protected async copyExchangeLink(): Promise<void> {
    await this.exchangeLinks.copy(this.exchangeCandidates().map((i) => i.video.id));
  }

  protected sendLink(): void {
    const picked = this.linkCandidates();
    void this.temporaryLinks.offer(
      picked.map((i) => ({
        id: i.video.id,
        title: i.video.title,
        thumbnailUrl: i.video.thumbnailUrl,
      })),
      this.store.selectedItems().length - picked.length,
    );
  }

  protected async copyLink(item: CollectionItemDto): Promise<void> {
    // The short link, as on the video page.
    await this.clipboard.copy(`${location.origin}/${item.video.code}`, 'video.linkCopied');
  }

  // --- hotkeys -------------------------------------------

  private onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (
      this.dialog.openDialogs.length ||
      // The side panel is over the shelf: Delete there asked to delete the selected video.
      this.panel.open() ||
      target?.closest('input, textarea, select, [contenteditable="true"], [cdkMenu]')
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.store.selectAll();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      // Ctrl+G groups, Ctrl+Shift+G ungroups, as in every design tool.
      e.preventDefault();
      if (e.shiftKey) void this.takeOutSelected();
      else void this.stackSelected();
    } else if (e.key === 'Escape') {
      this.store.clearSelection();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!this.store.selectedIds().length) return;
      e.preventDefault();
      void this.deleteSelected();
    } else if (e.key === 'Enter') {
      // A focused button or link answers Enter itself; it also opened the selected video.
      if (target?.closest('button, a, [role]')) return;
      const item = this.single();
      const stack = this.contextStack();
      if (item) this.open(item);
      else if (stack) this.openStack(stack.id);
    }
  }

  // --- file drop ----------------------------------------

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onFolder(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.addPicked(pickedFromInput(Array.from(input.files ?? [])));
    input.value = '';
  }

  private onDragEnter(e: DragEvent): void {
    if (!hasFiles(e)) return;
    this.dragDepth++;
    this.dragging.set(true);
  }

  private onDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  private onDragLeave(e: DragEvent): void {
    if (!hasFiles(e)) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  private onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    // A dropped folder is walked through; the entries exist only during this event.
    const entries = droppedEntries(e.dataTransfer);
    if (entries.some((entry) => entry.isDirectory))
      void readEntries(entries).then((picked) => this.addPicked(picked));
    else void this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  /** Files of an imported folder: each subfolder's videos go into a stack of its name. */
  private addPicked(picked: PickedFile[]): Promise<void> {
    const groups = new Map(picked.map((p) => [p.file, groupOf(p.path)]));
    return this.addFiles(
      picked.map((p) => p.file),
      groups,
    );
  }

  /**
   * Nothing starts before the limits are known: a file over the plan's size, or
   * larger than the room left on the shelf, never leaves the browser. 0 = no limit; the
   * server still refuses what a multipart upload cannot carry.
   */
  private async addFiles(files: File[], groups?: Map<File, UploadGroup | null>): Promise<void> {
    if (!this.verified()) {
      this.toast.error(this.t.translate('auth.verify.bannerText'));
      return;
    }
    if (!this.videos.quota()) await this.videos.reloadQuota();
    const q = this.videos.quota();
    const max = q?.maxFileBytes || Infinity;
    let room =
      q && q.quotaBytes > 0
        ? q.quotaBytes - q.usedBytes - q.reservedBytes - this.uploads.pendingBytes()
        : Infinity;
    const accepted: File[] = [];
    for (const file of files) {
      if (!(file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(file.name))) {
        this.toast.error(this.t.translate('upload.notVideo', { name: file.name }));
      } else if (file.size > max) {
        this.toast.error(
          this.t.translate('upload.tooLarge', { name: file.name, max: formatBytes(max) }),
        );
      } else if (file.size > room) {
        this.toast.error(
          this.t.translate('upload.noRoom', {
            name: file.name,
            left: formatBytes(Math.max(0, room)),
          }),
        );
      } else {
        accepted.push(file);
        room -= file.size;
      }
    }
    const folder = this.store.folder();
    if (accepted.length)
      this.uploads.addFiles(
        accepted,
        folder.kind === 'CATEGORY' ? { categoryId: folder.id } : {},
        (file) => groups?.get(file) ?? null,
      );
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }
}

function idsOf(joined: string): string[] {
  return joined ? joined.split(',') : [];
}

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

/** What a click on keeps the selection: the videos and stacks, controls, menus, dialogs. */
const KEEPS_SELECTION = [
  '[data-video-id]',
  '[data-stack-id]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="dialog"]',
  '[role="toolbar"]',
  '[role="option"]',
  '[role="listbox"]',
  '[contenteditable]',
  '.cdk-overlay-container',
].join(',');
