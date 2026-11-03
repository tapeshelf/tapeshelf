import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { MailService } from '../../infra/mail/mail.service.js';
import type { MailJob, MailQueueJob } from '../../infra/queue/queue.types.js';
import { renderNotificationMail } from './notification-mail.js';
import { NotificationsService } from './notifications.service.js';
import { unsubscribeToken } from './unsubscribe-token.js';

/**
 * Consumes `mail` jobs: renders a notification in the recipient's locale and sends it over SMTP,
 * or retries an account mail that was already rendered.
 */
@Injectable()
export class NotificationMailer {
  private readonly logger = new Logger(NotificationMailer.name);
  private readonly publicUrl: string;
  private readonly contactEmail: string | null;
  private readonly secret: string;

  constructor(
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    config: ConfigService<Env, true>,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', { infer: true })
      .replace(/\/$/, '');
    this.contactEmail = config.get('CONTACT_EMAIL', { infer: true }) ?? null;
    this.secret = config.get('JWT_SECRET', { infer: true });
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
    const token = encodeURIComponent(
      unsubscribeToken(this.secret, job.userId, job.type),
    );
    const rendered = renderNotificationMail(job.locale, job.type, job.payload, {
      publicUrl: this.publicUrl,
      username: job.username,
      contactEmail: this.contactEmail,
      unsubscribeUrl: `${this.publicUrl}/unsubscribe?t=${token}`,
    });
    if (!rendered) {
      this.logger.warn(`No email template for ${job.type}; skipped`);
      return false;
    }
    // RFC 8058: a mail client's "Unsubscribe" posts to this address, without opening anything.
    const sent = await this.mail.send(job.to, {
      ...rendered,
      headers: {
        'List-Unsubscribe': `<${this.publicUrl}/api/mail/unsubscribe?t=${token}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!sent) throw new Error(`SMTP delivery failed for ${job.type}`);
    if (job.notificationId)
      await this.notifications.markEmailed(job.notificationId);
    return true;
  }
}
