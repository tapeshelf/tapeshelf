import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../api/api';
import { chatUnread } from '../../api/fn/chat/chat-unread';
import type { MessageDto } from '../../api/models/message-dto';
import { AuthStore } from '../auth/auth.store';
import { WsService } from '../ws/ws.service';

export interface MessageEvent {
  conversationId: string;
  message: MessageDto;
}

export interface ReadEvent {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
}

/** Unread chat messages for the navigation badge; pages listen to the live events. */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly ws = inject(WsService);

  readonly unread = signal(0);

  constructor() {
    this.ws.on<{ count: number }>('chat.unread', ({ count }) => this.unread.set(count));
    this.ws.onResync(() => void this.refresh());
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        this.unread.set(0);
        if (user) void this.refresh();
      });
    });
  }

  async refresh(): Promise<void> {
    try {
      this.unread.set((await this.api.invoke(chatUnread)).count);
    } catch {
      /* decorative */
    }
  }

  onMessage(handler: (e: MessageEvent) => void): () => void {
    return this.ws.on<MessageEvent>('message.new', handler);
  }

  onRead(handler: (e: ReadEvent) => void): () => void {
    return this.ws.on<ReadEvent>('conversation.read', handler);
  }
}
