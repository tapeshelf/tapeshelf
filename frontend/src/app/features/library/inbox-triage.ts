import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, type Injector, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideGlobe,
  lucideLayers,
  lucideLock,
  lucidePlus,
  lucideSparkles,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';

import {
  Api,
  type CollectionItemDto,
  type StackDto,
  collectionList,
  myCollectionDeleteVideos,
  myCollectionInboxDone,
  myCollectionRenameMany,
  myCollectionUpdateHoldings,
  myCollectionUpdateVideos,
  stacksAdd,
  stacksList,
} from '../../api';
import { toApiError } from '../../core/api/api-error';
import { CategoriesStore } from '../../core/categories/categories.store';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { cleanTitle } from '../../shared/titles/clean-title';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { PromptService } from '../../shared/ui/prompt/prompt-dialog';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ThumbScrubComponent } from '../../shared/ui/thumb-scrub/thumb-scrub';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { VideoPlayerComponent } from '../video/video-player';

export interface InboxTriageData {
  username: string;
}

/**
 * Sorting the Inbox one video at a time: the video big — playing when it is ready — its
 * title with a tidier one offered, the categories as buttons, a stack, public or private. A
 * category or a stack sends it on to the next one; "keep without a category" too.
 */
@Component({
  selector: 'app-inbox-triage',
  imports: [
    FormsModule,
    TranslocoPipe,
    NgIcon,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
    ThumbScrubComponent,
    VideoPlayerComponent,
    AppDatePipe,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideArrowRight,
      lucideCheck,
      lucideGlobe,
      lucideLayers,
      lucideLock,
      lucidePlus,
      lucideSparkles,
      lucideTrash2,
      lucideX,
    }),
  ],
  template: `
    <section
      class="flex max-h-[92dvh] w-[min(1040px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-hard"
      role="dialog"
      [attr.aria-label]="'library.triage.title' | transloco"
      data-testid="inbox-triage"
    >
      <header class="flex items-center gap-3 border-b-2 border-line px-5 py-3">
        <h2 class="font-display text-lg font-bold tracking-tight">
          {{ 'library.triage.title' | transloco }}
        </h2>
        @if (items().length) {
          <span class="label-mono text-muted" data-testid="triage-progress">{{
            'library.triage.progress' | transloco: { n: sorted() + index() + 1, total: total() }
          }}</span>
        }
        <span class="flex-1"></span>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          [attr.aria-label]="'common.close' | transloco"
          (click)="ref.close(changed())"
        >
          <ng-icon name="lucideX" size="18" />
        </button>
      </header>

      @if (loading()) {
        <div class="flex justify-center py-16 text-muted"><app-spinner /></div>
      } @else if (current(); as item) {
        <div
          class="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div class="min-w-0">
            <div class="overflow-hidden rounded-lg border-2 border-line bg-surface-2">
              @if (item.video.status === 'READY') {
                <app-video-player [videoId]="item.video.id" [poster]="item.video.thumbnailUrl" />
              } @else {
                <app-thumb-scrub
                  class="block aspect-video"
                  [thumbnailUrl]="item.video.thumbnailUrl"
                  [frameUrls]="item.video.frameUrls"
                />
              }
            </div>
            <p class="label-mono mt-2 text-muted">
              {{ item.video.durationSec ? duration(item.video.durationSec) + ' · ' : ''
              }}{{ item.addedAt | appDate: 'mediumDate' }}
            </p>
          </div>

          <div class="flex flex-col gap-5">
            <div>
              <label class="label-mono mb-1.5 block text-muted" for="triage-title">{{
                'library.triage.name' | transloco
              }}</label>
              <input
                id="triage-title"
                appInput
                maxlength="150"
                [ngModel]="title()"
                (ngModelChange)="title.set($event)"
                (keydown.enter)="saveTitle()"
                (blur)="saveTitle()"
                data-testid="triage-title"
              />
              @if (suggestion(); as tidy) {
                <button
                  type="button"
                  class="mt-1.5 flex items-center gap-1.5 text-left text-xs text-muted hover:text-text"
                  (click)="title.set(tidy); saveTitle()"
                  data-testid="triage-tidy"
                >
                  <ng-icon name="lucideSparkles" size="12" class="shrink-0 text-accent-text" />
                  {{ 'library.triage.tidy' | transloco: { title: tidy } }}
                </button>
              }
            </div>

            <div>
              <p class="label-mono mb-1.5 text-muted">
                {{ 'library.triage.category' | transloco }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                @for (c of categories.items(); track c.id) {
                  <button
                    type="button"
                    class="max-w-full truncate rounded-md border-2 border-line/25 bg-surface px-2.5 py-1 text-sm transition-colors hover:border-line hover:bg-shelf hover:text-ink"
                    [disabled]="busy()"
                    (click)="toCategory(c.id)"
                    data-testid="triage-category"
                  >
                    {{ c.name }}
                  </button>
                }
                <button
                  type="button"
                  class="flex items-center gap-1 rounded-md border-2 border-dashed border-line/40 px-2.5 py-1 text-sm text-muted hover:border-line hover:text-text"
                  [disabled]="busy()"
                  (click)="newCategory()"
                >
                  <ng-icon name="lucidePlus" size="14" />{{ 'library.newCategory' | transloco }}
                </button>
              </div>
            </div>

            @if (stacks().length) {
              <div>
                <p class="label-mono mb-1.5 text-muted">{{ 'library.triage.stack' | transloco }}</p>
                <div class="flex flex-wrap gap-1.5">
                  @for (s of stacks(); track s.id) {
                    <button
                      type="button"
                      class="flex items-center gap-1.5 rounded-md border-2 border-line/25 bg-surface px-2.5 py-1 text-sm hover:border-line hover:bg-surface-2"
                      [disabled]="busy()"
                      (click)="toStack(s)"
                    >
                      <ng-icon name="lucideLayers" size="14" class="text-muted" />{{
                        s.name || ('stacks.stack' | transloco)
                      }}
                    </button>
                  }
                </div>
              </div>
            }

            @if (item.source === 'AUTHOR') {
              <div class="flex items-center gap-2">
                <span class="label-mono text-muted">{{
                  'library.triage.visibility' | transloco
                }}</span>
                <div class="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5">
                  @for (v of visibilities; track v) {
                    <button
                      type="button"
                      class="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs transition-colors"
                      [class.bg-inverse]="item.video.visibility === v"
                      [class.text-on-inverse]="item.video.visibility === v"
                      [class.text-muted]="item.video.visibility !== v"
                      [attr.aria-pressed]="item.video.visibility === v"
                      [disabled]="busy()"
                      (click)="setVisibility(v)"
                    >
                      <ng-icon [name]="v === 'PUBLIC' ? 'lucideGlobe' : 'lucideLock'" size="12" />{{
                        'videos.visibility.' + v | transloco
                      }}
                    </button>
                  }
                </div>
              </div>
            }

            <div class="mt-auto flex flex-wrap gap-2 border-t-2 border-line/15 pt-4">
              <button
                type="button"
                appButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="keep()"
                data-testid="triage-keep"
              >
                <ng-icon name="lucideCheck" size="14" />{{ 'library.triage.keep' | transloco }}
              </button>
              @if (item.source === 'AUTHOR') {
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="sm"
                  class="text-danger"
                  [disabled]="busy()"
                  (click)="remove()"
                >
                  <ng-icon name="lucideTrash2" size="14" />{{
                    'library.actions.delete' | transloco
                  }}
                </button>
              }
            </div>
          </div>
        </div>
        <footer class="flex items-center justify-between border-t-2 border-line px-5 py-3">
          <button
            type="button"
            appButton
            variant="ghost"
            size="sm"
            [disabled]="index() === 0"
            (click)="go(-1)"
          >
            <ng-icon name="lucideArrowLeft" size="14" />{{ 'library.triage.back' | transloco }}
          </button>
          <button
            type="button"
            appButton
            variant="ghost"
            size="sm"
            [disabled]="index() >= items().length - 1"
            (click)="go(1)"
            data-testid="triage-next"
          >
            {{ 'library.triage.next' | transloco }}<ng-icon name="lucideArrowRight" size="14" />
          </button>
        </footer>
      } @else {
        <div
          class="flex flex-col items-center gap-4 px-6 py-16 text-center"
          data-testid="triage-done"
        >
          <p class="font-display text-xl font-bold tracking-tight">
            {{ 'library.triage.done' | transloco }}
          </p>
          <button type="button" appButton (click)="ref.close(changed())">
            {{ 'common.close' | transloco }}
          </button>
        </div>
      }
    </section>
  `,
})
export class InboxTriageComponent {
  protected readonly data = inject<InboxTriageData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly categories = inject(CategoriesStore);
  private readonly api = inject(Api);
  private readonly prompt = inject(PromptService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  protected readonly visibilities = ['PRIVATE', 'PUBLIC'] as const;
  protected readonly items = signal<CollectionItemDto[]>([]);
  protected readonly index = signal(0);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  /** Read by the opener too: an Escape closes the dialog without a result. */
  readonly changed = signal(false);
  /** Sorted in this sitting, and how many the Inbox held: "12 of 400". */
  protected readonly sorted = signal(0);
  private readonly inboxSize = signal(0);
  protected readonly total = computed(() =>
    Math.max(this.inboxSize(), this.sorted() + this.items().length),
  );
  /** The Inbox comes a hundred at a time; the next hundred once these are sorted. */
  private more = false;
  protected readonly stacks = signal<StackDto[]>([]);
  protected readonly title = signal('');
  protected readonly current = computed(() => this.items()[this.index()] ?? null);
  /** A tidier title when the cleanup would change something. */
  protected readonly suggestion = computed(() => {
    const item = this.current();
    if (!item) return null;
    const tidy = cleanTitle(this.title());
    return tidy !== this.title().trim() ? tidy : null;
  });

  constructor() {
    void this.load();
  }

  protected duration(sec: number): string {
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected go(step: number): void {
    void this.saveTitle();
    this.show(this.index() + step);
  }

  protected async saveTitle(): Promise<void> {
    const item = this.current();
    const title = this.title().trim();
    if (!item || !title || title === item.video.title) return;
    await this.run(async () => {
      await this.api.invoke(myCollectionRenameMany, {
        body: { items: [{ videoId: item.video.id, title }] },
      });
      this.patch(item.video.id, { ...item, video: { ...item.video, title } });
    });
  }

  protected async toCategory(categoryId: string): Promise<void> {
    await this.saveTitle();
    await this.done(() =>
      this.api.invoke(myCollectionUpdateHoldings, {
        body: { videoIds: [this.current()!.video.id], categoryId },
      }),
    );
  }

  protected async newCategory(): Promise<void> {
    const name = await this.prompt.prompt({
      title: this.t.translate('library.newCategory'),
      label: this.t.translate('library.categoryName'),
      confirmLabel: this.t.translate('library.triage.create'),
      required: true,
      maxLength: 50,
    });
    if (!name?.trim()) return;
    try {
      const c = await this.categories.create(name.trim());
      await this.toCategory(c.id);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  protected async toStack(stack: StackDto): Promise<void> {
    await this.saveTitle();
    await this.done(() =>
      this.api.invoke(stacksAdd, {
        id: stack.id,
        body: { videoIds: [this.current()!.video.id], categoryId: stack.categoryId },
      }),
    );
  }

  protected async setVisibility(visibility: 'PUBLIC' | 'PRIVATE'): Promise<void> {
    const item = this.current();
    if (!item || item.video.visibility === visibility) return;
    await this.run(async () => {
      await this.api.invoke(myCollectionUpdateVideos, {
        body: { videoIds: [item.video.id], visibility },
      });
      this.patch(item.video.id, { ...item, video: { ...item.video, visibility } });
    });
  }

  protected async keep(): Promise<void> {
    await this.saveTitle();
    await this.done(() =>
      this.api.invoke(myCollectionInboxDone, { body: { videoIds: [this.current()!.video.id] } }),
    );
  }

  protected async remove(): Promise<void> {
    await this.done(() =>
      this.api.invoke(myCollectionDeleteVideos, { body: { videoIds: [this.current()!.video.id] } }),
    );
  }

  /** The video is sorted: it leaves the list and the next one shows. */
  private async done(action: () => Promise<unknown>): Promise<void> {
    const item = this.current();
    if (!item) return;
    await this.run(async () => {
      await action();
      const list = this.items().filter((i) => i.video.id !== item.video.id);
      this.items.set(list);
      this.sorted.update((n) => n + 1);
      this.show(Math.min(this.index(), list.length - 1));
    });
    if (!this.items().length && this.more) await this.load();
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.changed.set(true);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  private show(i: number): void {
    const n = Math.max(0, Math.min(i, this.items().length - 1));
    this.index.set(n);
    this.title.set(this.items()[n]?.video.title ?? '');
  }

  private patch(id: string, item: CollectionItemDto): void {
    this.items.update((list) => list.map((i) => (i.video.id === id ? item : i)));
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [page, stacks] = await Promise.all([
        this.api.invoke(collectionList, {
          username: this.data.username,
          section: 'INBOX',
          sort: 'added',
          limit: 100,
        }),
        this.api.invoke(stacksList).catch(() => []),
      ]);
      this.items.set(page.items);
      this.more = page.items.length < page.total;
      if (!this.sorted()) this.inboxSize.set(page.total);
      this.stacks.set(stacks);
      this.show(0);
    } catch (e) {
      this.toast.error(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.loading.set(false);
    }
  }
}

/** Opens the triage; resolves true when something was sorted (the shelf reloads). */
@Injectable({ providedIn: 'root' })
export class InboxTriage {
  private readonly dialog = inject(Dialog);

  async open(username: string, injector?: Injector): Promise<boolean> {
    const ref = this.dialog.open<boolean, InboxTriageData, InboxTriageComponent>(
      InboxTriageComponent,
      {
        data: { username } satisfies InboxTriageData,
        backdropClass: 'vs-backdrop',
        injector,
        autoFocus: 'first-heading',
      },
    );
    const triage = ref.componentInstance;
    return (await firstValueFrom(ref.closed)) ?? triage?.changed() ?? false;
  }
}
