import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job, type RedisOptions } from 'bullmq';

import { QUEUE_CONNECTION } from '../../infra/queue/queue.connection.js';
import { QUEUE_PREFIX, QueueService } from '../../infra/queue/queue.service.js';
import { QUEUES, type MailQueueJob } from '../../infra/queue/queue.types.js';
import { NotificationMailer } from './notification-mailer.js';
import { OutboxRelayService } from './outbox-relay.service.js';

/** Worker-process consumers: outbox drains (one at a time) and notification emails. */
@Injectable()
export class NotificationWorkers
  implements OnModuleInit, BeforeApplicationShutdown
{
  private readonly logger = new Logger(NotificationWorkers.name);
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(QUEUE_CONNECTION) private readonly connection: RedisOptions,
    private readonly relay: OutboxRelayService,
    private readonly mailer: NotificationMailer,
    private readonly queues: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    const opts = (concurrency: number) => ({
      connection: this.connection,
      prefix: QUEUE_PREFIX,
      concurrency,
    });
    this.add(new Worker(QUEUES.outbox, () => this.relay.drain(), opts(1)));
    this.add(
      new Worker<MailQueueJob>(
        QUEUES.mail,
        (job: Job<MailQueueJob>) => this.mailer.sendJob(job.data),
        opts(2),
      ),
    );
    await this.queues.scheduleOutbox();
    this.logger.log('Workers started: outbox×1, mail×2');
  }

  private add(worker: Worker): void {
    worker.on('failed', (job, err) =>
      this.logger.error(
        `${worker.name} job ${job?.id ?? '?'} failed: ${err.message}`,
      ),
    );
    worker.on('error', (err) =>
      this.logger.error(`${worker.name} worker error: ${err.message}`),
    );
    this.workers.push(worker);
  }

  /** Before the database and Redis go. */
  async beforeApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.workers.map((w) => w.close().catch(() => undefined)),
    );
  }
}
