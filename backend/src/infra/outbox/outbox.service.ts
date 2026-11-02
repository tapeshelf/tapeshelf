import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { QueueService } from '../queue/queue.service.js';
import type { OutboxEventType, OutboxPayloads } from './outbox.types.js';

/** Anything that can create an OutboxEvent row: the client or an interactive transaction. */
export type OutboxWriter = Pick<Prisma.TransactionClient, 'outboxEvent'>;

/**
 * Side effects go through the outbox: `emit` inside the transaction that makes the change, then
 * `nudge` once it committed so the worker drains the table right away (it also polls every few seconds).
 */
@Injectable()
export class OutboxService {
  constructor(private readonly queues: QueueService) {}

  async emit<T extends OutboxEventType>(
    tx: OutboxWriter,
    type: T,
    payload: OutboxPayloads[T],
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: { type, payload: payload as unknown as Prisma.InputJsonObject },
    });
  }

  /** Best effort: a lost nudge only delays delivery until the next scheduled drain. */
  async nudge(): Promise<void> {
    await this.queues.nudgeOutbox().catch(() => undefined);
  }
}
