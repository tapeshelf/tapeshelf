import { Injectable, Logger } from '@nestjs/common';

import { QueueService } from '../queue/queue.service.js';
import { MailService } from './mail.service.js';
import type { RenderedMail } from './templates.js';

/**
 * Account mail (confirmation, password reset): sent at once so the link arrives in seconds; when
 * SMTP refuses, the mail goes to the `mail` queue and the worker retries it with backoff instead of
 * it being lost.
 */
@Injectable()
export class MailDeliveryService {
  private readonly logger = new Logger(MailDeliveryService.name);

  constructor(
    private readonly mail: MailService,
    private readonly queues: QueueService,
  ) {}

  get sends(): boolean {
    return this.mail.sends;
  }

  async deliver(to: string, mail: RenderedMail): Promise<void> {
    if (await this.mail.send(to, mail)) return;
    await this.queues
      .enqueueMail({ kind: 'rendered', to, ...mail })
      .catch((err: unknown) =>
        this.logger.error(
          `Cannot queue "${mail.subject}" for a retry: ${(err as Error).message}`,
        ),
      );
  }
}
