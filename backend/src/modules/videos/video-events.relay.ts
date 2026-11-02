import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QueueEvents, type RedisOptions } from 'bullmq';

import { QUEUE_CONNECTION } from '../../infra/queue/queue.connection.js';
import { QUEUE_PREFIX } from '../../infra/queue/queue.service.js';
import {
  QUEUES,
  type EditProgressEvent,
  type VideoJobResult,
  type VideoProgressEvent,
  type VideoRemovedEvent,
} from '../../infra/queue/queue.types.js';
import { WsGateway } from '../../infra/ws/ws.gateway.js';
import { VideosService } from './videos.service.js';

/** Websocket events pushed to the owner's room (frontend `WsService`). */
export const WS_EVENT = {
  progress: 'video.progress',
  changed: 'video.changed',
  /** An editor render's progress, to whoever asked for it. */
  edit: 'video.edit',
  /** A video left the owner's shelf without a deletion: an edited copy that never came to be. */
  removed: 'video.removed',
} as const;

/** API side of progress reporting: BullMQ job events → owner's websocket room (p.7). */
@Injectable()
export class VideoEventsRelay implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(VideoEventsRelay.name);
  private readonly listeners: QueueEvents[] = [];

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: RedisOptions,
    private readonly ws: WsGateway,
    private readonly videos: VideosService,
  ) {}

  onModuleInit(): void {
    for (const name of [
      QUEUES.remux,
      QUEUES.transcode,
      QUEUES.thumbnail,
      QUEUES.edit,
    ]) {
      const events = new QueueEvents(name, {
        connection: this.connection,
        prefix: QUEUE_PREFIX,
      });
      events.on('progress', ({ data }) => {
        const event = data as Partial<
          VideoProgressEvent & EditProgressEvent & VideoRemovedEvent
        >;
        if (!event || typeof event.userId !== 'string') return;
        // The editor's own event, a tile going, or a tile's progress.
        this.ws.emitToUser(
          event.userId,
          event.edit
            ? WS_EVENT.edit
            : event.removed
              ? WS_EVENT.removed
              : WS_EVENT.progress,
          event.removed ? { videoId: event.videoId } : event,
        );
      });
      events.on('completed', ({ returnvalue }) => {
        void this.onCompleted(returnvalue);
      });
      events.on('error', (err) =>
        this.logger.warn(`Queue events (${name}): ${err.message}`),
      );
      this.listeners.push(events);
    }
  }

  private async onCompleted(returnvalue: unknown): Promise<void> {
    let result: Partial<VideoJobResult> | null = null;
    try {
      result =
        typeof returnvalue === 'string'
          ? JSON.parse(returnvalue)
          : (returnvalue as object);
    } catch {
      return;
    }
    if (!result?.changed || !result.userId || !result.videoId) return;
    try {
      const video = await this.videos.getOwnDto(result.userId, result.videoId);
      this.ws.emitToUser(result.userId, WS_EVENT.changed, { video });
    } catch {
      // deleted meanwhile or not found: nothing to push
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.listeners.map((l) => l.close().catch(() => undefined)),
    );
  }
}
