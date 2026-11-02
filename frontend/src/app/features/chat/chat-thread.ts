import { Dialog } from '@angular/cdk/dialog';
import {
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCheck,
  lucideCheckCheck,
  lucideFilm,
  lucideLock,
  lucidePaperclip,
  lucideSendHorizontal,
  lucideX,
} from '@ng-icons/lucide';

import {
  Api,
  type ChatVideoDto,
  type MessageDto,
  type ThreadDto,
  chatMessages,
  chatRead,
  chatSend,
  chatThread,
} from '../../api';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ChatStore } from '../../core/chat/chat.store';
import { WsService } from '../../core/ws/ws.service';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { InputDirective } from '../../shared/ui/field/input.directive';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { VideoPickerDialog, type VideoPickerData } from './video-picker-dialog';
import { SensitiveBlurDirective } from '../../core/content/sensitive-blur.directive';
import { profileLink, videoLink, videoState } from '../../core/navigation/user-links';
import { panelLink } from '../../core/navigation/panels';

const PAGE = 50;
/** Closer than this to the bottom counts as "reading the latest": new messages scroll into view. */
const STICKY_PX = 120;

/**
 * One conversation: history with infinite scroll upwards, live messages and read
 * marks over the websocket, a composer with an optional video card. Sending is disabled with the
 * reason when the two are not friends (or the other account is gone); history stays readable.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [
    TranslocoPipe,
    SensitiveBlurDirective,
    AppDatePipe,
    FormsModule,
    RouterLink,
    NgIcon,
    DurationPipe,
    AvatarComponent,
    ButtonDirective,
    InputDirective,
    SpinnerComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideCheckCheck,
      lucideFilm,
      lucideLock,
      lucidePaperclip,
      lucideSendHorizontal,
      lucideX,
    }),
  ],
  host: {
    class: 'flex min-h-0 flex-col',
    '(document:visibilitychange)': 'markRead()',
  },
  template: `
    @if (error(); as message) {
      <p class="m-auto max-w-sm p-6 text-center text-sm text-muted">{{ message }}</p>
    } @else if (thread(); as t) {
      <header class="flex items-center gap-3 border-b-2 border-line px-4 py-3">
        <a
          [routerLink]="panelLink('messages')"
          [queryParamsHandling]="'merge'"
          class="rounded-sm p-1 text-muted hover:bg-surface-2 hover:text-text lg:hidden"
          [attr.aria-label]="'chat.back' | transloco"
        >
          <ng-icon name="lucideArrowLeft" size="18" />
        </a>
        <app-avatar
          [url]="t.other.avatarUrl"
          [name]="t.other.displayName"
          [muted]="t.other.deleted"
          [size]="36"
        />
        @if (t.other.deleted) {
          <span class="font-semibold text-muted">{{ 'chat.deletedUser' | transloco }}</span>
        } @else {
          <!-- No page to open once they hid it. -->
          <a
            [routerLink]="t.other.pageHidden ? null : profileLink(t.other.username)"
            class="min-w-0"
            [class.hover:underline]="!t.other.pageHidden"
          >
            <span class="block truncate font-semibold" data-testid="chat-partner">{{
              t.other.displayName
            }}</span>
            <span class="label-mono block truncate text-muted">&#64;{{ t.other.username }}</span>
          </a>
        }
      </header>

      <div
        #scroller
        class="min-h-0 flex-1 overflow-y-auto bg-canvas/60 px-3 py-4 sm:px-5"
        role="log"
        data-testid="chat-messages"
        (scroll)="onScroll()"
      >
        <!-- Earlier messages come by themselves a screen before the top. -->
        @if (hasMore()) {
          <div class="mb-3 flex h-8 items-center justify-center text-muted">
            @if (olderFailed()) {
              <button type="button" appButton variant="ghost" size="sm" (click)="retryOlder()">
                {{ 'common.retry' | transloco }}
              </button>
            } @else if (loadingOlder()) {
              <span role="status" class="flex items-center">
                <app-spinner [size]="18" />
                <span class="sr-only">{{ 'common.loading' | transloco }}</span>
              </span>
            }
          </div>
        } @else if (!t.other.deleted) {
          <p class="label-mono mb-4 text-center text-faint">
            {{ 'chat.start' | transloco: { name: t.other.displayName } }}
          </p>
        }
        @for (m of messages(); track m.id; let i = $index) {
          @if (newDay(i)) {
            <div class="label-mono my-3 flex items-center gap-3 text-faint">
              <span class="h-px flex-1 bg-ink/10"></span>{{ m.createdAt | appDate: 'mediumDate'
              }}<span class="h-px flex-1 bg-ink/10"></span>
            </div>
          }
          <div class="mb-2 flex" [class.justify-end]="mine(m)" data-testid="chat-message">
            <div class="flex max-w-[80%] flex-col" [class.items-end]="mine(m)">
              <div
                class="overflow-hidden rounded-lg border-2 border-line text-sm"
                [class]="
                  mine(m)
                    ? 'rounded-br-sm bg-accent text-accent-fg'
                    : 'rounded-bl-sm bg-surface text-text'
                "
              >
                @if (m.video; as v) {
                  <a
                    [routerLink]="videoLink(v.code)"
                    [state]="videoState(v.holderUsername)"
                    class="block w-60 max-w-full border-b-2 border-line bg-surface text-text"
                    data-testid="chat-video"
                  >
                    <span class="relative block aspect-video bg-surface-2">
                      @if (v.thumbnailUrl) {
                        <img
                          [src]="v.thumbnailUrl"
                          [appSensitiveBlur]="v.sensitive && !mine(m)"
                          alt=""
                          class="h-full w-full object-cover"
                        />
                      } @else {
                        <span class="flex h-full items-center justify-center text-faint">
                          <ng-icon name="lucideFilm" size="24" />
                        </span>
                      }
                      @if (v.visibility === 'PRIVATE') {
                        <span
                          class="label-mono absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-sm border border-line bg-canvas px-1 py-0.5 text-ink uppercase"
                        >
                          <ng-icon name="lucideLock" size="11" />{{
                            'videos.visibility.PRIVATE' | transloco
                          }}
                        </span>
                      }
                      @if (v.durationSec !== null) {
                        <span
                          class="absolute right-1.5 bottom-1.5 rounded-sm bg-inverse px-1 py-0.5 font-mono text-[10px] text-on-inverse"
                          >{{ v.durationSec | duration }}</span
                        >
                      }
                    </span>
                    <span class="block truncate px-2.5 py-1.5 text-[13px] font-semibold">{{
                      v.title
                    }}</span>
                  </a>
                } @else if (m.videoUnavailable) {
                  <span
                    class="flex items-center gap-2 border-b-2 border-line bg-surface-2 px-3 py-2 text-xs text-muted italic"
                  >
                    <ng-icon name="lucideFilm" size="14" />{{ 'chat.videoUnavailable' | transloco }}
                  </span>
                }
                @if (m.body) {
                  <p class="px-3 py-2 break-words whitespace-pre-wrap">{{ m.body }}</p>
                }
              </div>
              <span class="label-mono mt-1 flex items-center gap-1 text-faint">
                {{ m.createdAt | appDate: 'shortTime' }}
                @if (mine(m)) {
                  <ng-icon
                    [name]="isRead(m) ? 'lucideCheckCheck' : 'lucideCheck'"
                    size="13"
                    [class.text-accent-text]="isRead(m)"
                    [attr.aria-label]="(isRead(m) ? 'chat.read' : 'chat.sent') | transloco"
                    [attr.data-testid]="isRead(m) ? 'read-mark' : 'sent-mark'"
                  />
                }
              </span>
            </div>
          </div>
        }
      </div>

      @if (t.sendBlocker; as reason) {
        <p
          class="border-t-2 border-line bg-surface-2 px-4 py-3 text-sm text-muted"
          data-testid="chat-blocked"
        >
          {{ 'chat.blocker.' + reason | transloco }}
        </p>
      } @else {
        <form class="border-t-2 border-line bg-surface p-3" (submit)="submit($event)">
          @if (attachment(); as v) {
            <div
              class="mb-2 flex items-center gap-2 rounded-md border-2 border-line bg-shelf px-2 py-1.5 text-sm text-ink"
              data-testid="chat-attachment"
            >
              <ng-icon name="lucideFilm" size="14" />
              <span class="min-w-0 flex-1 truncate font-semibold">{{ v.title }}</span>
              <button
                type="button"
                class="rounded-sm p-0.5 hover:bg-canvas"
                [attr.aria-label]="'chat.removeAttachment' | transloco"
                (click)="attachment.set(null)"
              >
                <ng-icon name="lucideX" size="14" />
              </button>
            </div>
          }
          <div class="flex items-end gap-2">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-line bg-surface transition-colors hover:bg-surface-2"
              [attr.aria-label]="'chat.attach' | transloco"
              data-testid="chat-attach"
              (click)="attach()"
            >
              <ng-icon name="lucidePaperclip" size="18" />
            </button>
            <textarea
              #input
              appInput
              rows="1"
              class="max-h-40 min-h-10 flex-1 resize-none"
              maxlength="4000"
              [(ngModel)]="draft"
              name="draft"
              [placeholder]="'chat.placeholder' | transloco"
              [attr.aria-label]="'chat.placeholder' | transloco"
              data-testid="chat-input"
              (input)="grow()"
              (keydown.enter)="onEnter($event)"
            ></textarea>
            <button
              type="submit"
              appButton
              class="shrink-0"
              [disabled]="sending() || (!draft.trim() && !attachment())"
              data-testid="chat-send"
            >
              <ng-icon name="lucideSendHorizontal" size="16" />
              <span class="hidden sm:inline">{{ 'chat.send' | transloco }}</span>
            </button>
          </div>
        </form>
      }
    } @else {
      <div class="m-auto text-muted"><app-spinner /></div>
    }
  `,
})
export class ChatThreadComponent {
  protected readonly panelLink = panelLink;
  protected readonly profileLink = profileLink;
  protected readonly videoLink = videoLink;
  protected readonly videoState = videoState;
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly chat = inject(ChatStore);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  readonly username = input.required<string>();

  protected readonly thread = signal<ThreadDto | null>(null);
  protected readonly messages = signal<MessageDto[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly loadingOlder = signal(false);
  /** Earlier messages did not come: no more tries until the reader asks. */
  protected readonly olderFailed = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly attachment = signal<ChatVideoDto | null>(null);
  private readonly otherLastRead = signal<string | null>(null);
  protected draft = '';

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly inputEl = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly me = computed(() => this.auth.user()?.id ?? '');
  private lastMarked: string | null = null;
  private loadSeq = 0;

  constructor() {
    effect(() => {
      const username = this.username();
      untracked(() => {
        // Another conversation: what was being written to the last one does not follow.
        this.draft = '';
        this.attachment.set(null);
        void this.load(username);
      });
    });
    const offMessage = this.chat.onMessage(({ conversationId, message }) => {
      const t = this.thread();
      if (!t) return;
      const ours = t.conversation
        ? conversationId === t.conversation.id
        : message.senderId === t.other.id || message.senderId === this.me();
      if (!ours) return;
      if (!t.conversation) {
        void this.load(this.username(), { keepScroll: true });
        return;
      }
      this.append(message);
      if (message.senderId !== this.me()) this.markRead();
    });
    const offRead = this.chat.onRead((e) => {
      const t = this.thread();
      if (t?.conversation?.id === e.conversationId && e.userId === t.other.id)
        this.otherLastRead.set(e.lastReadMessageId);
    });
    const offResync = inject(WsService).onResync(() => void this.catchUp());
    inject(DestroyRef).onDestroy(() => {
      offMessage();
      offRead();
      offResync();
    });
  }

  protected mine(m: MessageDto): boolean {
    return m.senderId === this.me();
  }

  /** Message ids are uuid v7: comparing them compares creation time. */
  protected isRead(m: MessageDto): boolean {
    const mark = this.otherLastRead();
    return !!mark && mark >= m.id;
  }

  protected newDay(i: number): boolean {
    const list = this.messages();
    if (i === 0) return true;
    return list[i]!.createdAt.slice(0, 10) !== list[i - 1]!.createdAt.slice(0, 10);
  }

  /** Within a screen of the top (or a thread too short to scroll): the earlier page comes. */
  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (
      el &&
      el.scrollTop < el.clientHeight &&
      this.hasMore() &&
      !this.loadingOlder() &&
      !this.olderFailed()
    )
      void this.loadOlder();
  }

  protected retryOlder(): void {
    this.olderFailed.set(false);
    void this.loadOlder();
  }

  protected onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.shiftKey || k.isComposing) return;
    e.preventDefault();
    void this.send();
  }

  protected submit(e: Event): void {
    e.preventDefault();
    void this.send();
  }

  protected grow(): void {
    const el = this.inputEl()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  protected attach(): void {
    const user = this.auth.user();
    if (!user) return;
    const ref = this.dialog.open<ChatVideoDto, VideoPickerData>(VideoPickerDialog, {
      data: { username: user.username },
      backdropClass: 'vs-backdrop',
      autoFocus: 'first-tabbable',
    });
    ref.closed.subscribe((video) => {
      if (video) this.attachment.set(video);
    });
  }

  protected async loadOlder(): Promise<void> {
    const conv = this.thread()?.conversation;
    const first = this.messages()[0];
    if (!conv || !first || this.loadingOlder()) return;
    this.loadingOlder.set(true);
    const el = this.scroller()?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await this.api.invoke(chatMessages, {
        id: conv.id,
        before: first.id,
        limit: PAGE,
      });
      // Another conversation opened meanwhile: these pages are not its.
      if (this.thread()?.conversation?.id !== conv.id) return;
      this.messages.update((list) => [...page.items, ...list]);
      this.hasMore.set(page.hasMore);
      // Keep the message the reader was looking at in place; still near the top — the next page.
      setTimeout(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
        this.onScroll();
      });
    } catch {
      this.olderFailed.set(true);
    } finally {
      this.loadingOlder.set(false);
    }
  }

  /** Marks the newest incoming message read while the page is visible. */
  markRead(): void {
    const conv = this.thread()?.conversation;
    if (!conv || document.visibilityState !== 'visible') return;
    const last = [...this.messages()].reverse().find((m) => m.senderId !== this.me());
    if (!last || last.id === this.lastMarked) return;
    this.lastMarked = last.id;
    void this.api
      .invoke(chatRead, { id: conv.id, body: { messageId: last.id } })
      .catch(() => (this.lastMarked = null));
  }

  private async send(): Promise<void> {
    const body = this.draft.trim();
    const video = this.attachment();
    if ((!body && !video) || this.sending()) return;
    this.sending.set(true);
    const to = this.username();
    try {
      const message = await this.api.invoke(chatSend, {
        username: to,
        body: { body: body || undefined, videoId: video?.id },
      });
      // Another conversation opened while it went: it went where it was written, and nothing of
      // the one open now is touched — its list, its draft.
      if (this.username() !== to) return;
      this.draft = '';
      this.attachment.set(null);
      const el = this.inputEl()?.nativeElement;
      if (el) el.style.height = '';
      if (!this.thread()?.conversation) await this.load(this.username(), { keepScroll: true });
      this.append(message, true);
    } catch (e) {
      const err = toApiError(e);
      this.toast.error(err.message || this.t.translate('errors.unknown'));
      if (err.statusCode === 403) void this.load(this.username(), { keepScroll: true });
    } finally {
      this.sending.set(false);
    }
  }

  private append(message: MessageDto, force = false): void {
    const el = this.scroller()?.nativeElement;
    const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_PX;
    this.messages.update((list) =>
      list.some((m) => m.id === message.id) ? list : [...list, message],
    );
    if (force || atBottom) this.scrollToBottom();
  }

  /**
   * After the socket was down (sleep, network, a deploy): the messages and read marks of that time,
   * without moving what the reader is looking at. More than a page missed: the newest
   * page replaces the list, as on opening.
   */
  private async catchUp(): Promise<void> {
    const conv = this.thread()?.conversation;
    if (!conv) return void this.load(this.username(), { keepScroll: true });
    const seq = this.loadSeq;
    try {
      const [thread, page] = await Promise.all([
        this.api.invoke(chatThread, { username: this.username() }),
        this.api.invoke(chatMessages, { id: conv.id, limit: PAGE }),
      ]);
      if (seq !== this.loadSeq) return;
      this.otherLastRead.set(thread.conversation?.otherLastReadMessageId ?? null);
      const last = this.messages().at(-1)?.id ?? '';
      const fresh = page.items.filter((m) => m.id > last);
      if (!fresh.length) return;
      if (page.hasMore && page.items[0]!.id > last) {
        this.messages.set(page.items);
        this.hasMore.set(true);
        this.scrollToBottom();
      } else for (const m of fresh) this.append(m);
      this.markRead();
    } catch {
      /* the next event or a reload brings them */
    }
  }

  private async load(username: string, opts: { keepScroll?: boolean } = {}): Promise<void> {
    const seq = ++this.loadSeq;
    if (!opts.keepScroll) {
      this.thread.set(null);
      this.messages.set([]);
      this.attachment.set(null);
      this.draft = '';
      this.lastMarked = null;
      this.olderFailed.set(false);
    }
    this.error.set(null);
    try {
      const thread = await this.api.invoke(chatThread, { username });
      if (seq !== this.loadSeq) return;
      let items: MessageDto[] = [];
      let hasMore = false;
      if (thread.conversation) {
        const page = await this.api.invoke(chatMessages, {
          id: thread.conversation.id,
          limit: PAGE,
        });
        if (seq !== this.loadSeq) return;
        items = page.items;
        hasMore = page.hasMore;
      }
      this.thread.set(thread);
      this.otherLastRead.set(thread.conversation?.otherLastReadMessageId ?? null);
      this.messages.set(items);
      this.hasMore.set(hasMore);
      this.scrollToBottom();
      this.markRead();
    } catch (e) {
      if (seq === this.loadSeq)
        this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
      this.onScroll(); // a short thread fills up with earlier messages
    });
  }
}
