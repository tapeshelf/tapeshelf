import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFilm, lucideMessageCircle } from '@ng-icons/lucide';

import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { Api, type ConversationDto, chatList } from '../../api';
import { AuthStore } from '../../core/auth/auth.store';
import { ChatStore } from '../../core/chat/chat.store';
import { WsService } from '../../core/ws/ws.service';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ChatThreadComponent } from './chat-thread';
import { panelLink } from '../../core/navigation/panels';

/** Live events arrive in bursts (a message, then the unread counter): refetch the list once. */
const REFRESH_MS = 250;

/**
 * /messages and /messages/:username: conversations on the left, the open one on
 * the right. On narrow screens only one of the two is shown.
 */
@Component({
  selector: 'app-messages-page',
  imports: [
    TranslocoPipe,
    AppDatePipe,
    RouterLink,
    NgIcon,
    AvatarComponent,
    SpinnerComponent,
    ChatThreadComponent,
  ],
  providers: [provideIcons({ lucideFilm, lucideMessageCircle })],
  template: `
    <div
      class="grid h-[calc(100dvh-12rem)] min-h-[26rem] gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6"
    >
      <section
        class="min-h-0 flex-col overflow-hidden rounded-xl bg-surface"
        [class]="username() ? 'hidden lg:flex' : 'flex'"
      >
        <h1 class="border-b-2 border-line px-4 py-3 font-display text-xl font-bold tracking-tight">
          {{ 'chat.title' | transloco }}
        </h1>
        <div class="min-h-0 flex-1 overflow-y-auto" data-testid="conversation-list">
          @if (!loaded()) {
            <div class="flex justify-center py-10 text-muted"><app-spinner /></div>
          } @else if (items().length === 0) {
            <p class="px-5 py-10 text-center text-sm text-muted">{{ 'chat.empty' | transloco }}</p>
          } @else {
            @for (c of items(); track c.id) {
              <a
                [routerLink]="panelLink('messages', c.other.username)"
                [queryParamsHandling]="'merge'"
                class="flex items-center gap-3 border-b border-line/10 px-3 py-2.5 transition-colors"
                [class]="active(c) ? 'bg-shelf' : 'hover:bg-surface-2'"
                [attr.aria-current]="active(c) ? 'page' : null"
                data-testid="conversation"
              >
                <app-avatar
                  [url]="c.other.avatarUrl"
                  [name]="c.other.displayName"
                  [muted]="c.other.deleted"
                  [size]="40"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <span class="truncate font-semibold" [class.text-muted]="c.other.deleted">{{
                      c.other.deleted ? ('chat.deletedUser' | transloco) : c.other.displayName
                    }}</span>
                    @if (c.lastMessage; as m) {
                      <span class="label-mono ml-auto shrink-0 text-faint">{{
                        m.createdAt | appDate: (isToday(m.createdAt) ? 'shortTime' : 'MMM d')
                      }}</span>
                    }
                  </span>
                  <span class="flex items-center gap-2">
                    <span class="flex min-w-0 items-center gap-1 truncate text-sm text-muted">
                      @if (c.lastMessage; as m) {
                        @if (m.senderId === me()) {
                          <span class="shrink-0">{{ 'chat.you' | transloco }}:</span>
                        }
                        @if (m.body) {
                          <span class="truncate">{{ m.body }}</span>
                        } @else {
                          <ng-icon name="lucideFilm" size="13" class="shrink-0" />{{
                            'chat.videoPreview' | transloco
                          }}
                        }
                      }
                    </span>
                    @if (c.unread > 0) {
                      <span
                        class="ml-auto shrink-0 rounded-full bg-accent px-1.5 font-mono text-[11px] font-bold text-accent-fg"
                        data-testid="conversation-unread"
                        >{{ c.unread }}</span
                      >
                    }
                  </span>
                </span>
              </a>
            }
          }
        </div>
      </section>

      @if (username(); as u) {
        <app-chat-thread class="overflow-hidden rounded-xl bg-surface" [username]="u" />
      } @else {
        <section
          class="hidden flex-col items-center justify-center gap-3 rounded-xl bg-surface-2/60 text-muted lg:flex"
        >
          <ng-icon name="lucideMessageCircle" size="32" />
          <p class="text-sm">{{ 'chat.choose' | transloco }}</p>
        </section>
      }
    </div>
  `,
})
export class MessagesPage {
  protected readonly panelLink = panelLink;
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly chat = inject(ChatStore);

  /** Route parameter of /messages/:username. */
  readonly username = input<string>();

  protected readonly items = signal<ConversationDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly me = computed(() => this.auth.user()?.id ?? '');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.load();
    const ws = inject(WsService);
    const offs = [
      this.chat.onMessage(() => this.refreshSoon()),
      this.chat.onRead(() => this.refreshSoon()),
      ws.on('chat.unread', () => this.refreshSoon()),
      ws.onResync(() => this.refreshSoon()),
    ];
    inject(DestroyRef).onDestroy(() => {
      for (const off of offs) off();
      if (this.timer) clearTimeout(this.timer);
    });
  }

  protected active(c: ConversationDto): boolean {
    const u = this.username()?.toLowerCase();
    return !!u && c.other.username === u;
  }

  protected isToday(iso: string): boolean {
    return new Date(iso).toDateString() === new Date().toDateString();
  }

  private refreshSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.load();
    }, REFRESH_MS);
  }

  private async load(): Promise<void> {
    try {
      this.items.set((await this.api.invoke(chatList)).items);
    } catch {
      /* the thread shows its own errors; the list just stays as it was */
    } finally {
      this.loaded.set(true);
    }
  }
}
