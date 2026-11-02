import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { MailService } from '../../infra/mail/mail.service.js';
import type { MailJob, MailQueueJob } from '../../infra/queue/queue.types.js';
import { renderNotificationMail } from './notification-mail.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Consumes `mail` jobs: renders a notification in the recipient's locale and sends it over SMTP,
 * or retries an account mail that was already rendered.
 */
@Injectable()
export class NotificationMailer {
  private readonly logger = new Logger(NotificationMailer.name);
  private readonly publicUrl: string;
  private readonly contactEmail: string | null;

  constructor(
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.contactEmail = config.get('CONTACT_EMAIL', { infer: true }) ?? null;
  }

  /** Throws when SMTP refuses, so BullMQ retries with backoff. */
  async sendJob(job: MailQueueJob): Promise<boolean> {
    if ('kind' in job) {
      if (!(await this.mail.send(job.to, job)))
        throw new Error(`SMTP delivery failed for "${job.subject}"`);
      return true;
    }
    return this.sendNotification(job);
  }

  private async sendNotification(job: MailJob): Promise<boolean> {
    const rendered = renderNotificationMail(job.locale, job.type, job.payload, {
      publicUrl: this.publicUrl,
      username: job.username,
      contactEmail: this.contactEmail,
    });
    if (!rendered) {
      this.logger.warn(`No email template for ${job.type}; skipped`);
      return false;
    }
    const sent = await this.mail.send(job.to, rendered);
    if (!sent) throw new Error(`SMTP delivery failed for ${job.type}`);
    if (job.notificationId)
      await this.notifications.markEmailed(job.notificationId);
    return true;
  }
}
