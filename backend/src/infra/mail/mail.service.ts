import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { Env } from '../../config/env.js';
import type { RenderedMail } from './templates.js';

/** Thin SMTP sender; delivery itself goes through the mail queue. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  /** Mail goes out from an address nobody reads: an answer reaches the operator's contact. */
  private readonly replyTo: string | undefined;
  /** The demo sends nothing, nor does an instance without an email account. */
  private readonly sink: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.sink =
      config.get('DEMO_MODE', { infer: true }) ||
      config.get('EMAIL_DISABLED', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('SMTP_FROM', { infer: true });
    this.replyTo = config.get('CONTACT_EMAIL', { infer: true }) || undefined;
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: user
        ? { user, pass: config.get('SMTP_PASS', { infer: true }) }
        : undefined,
      connectionTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send(to: string, mail: RenderedMail): Promise<boolean> {
    if (this.sink) {
      this.logger.debug(`Demo: "${mail.subject}" to ${to} not sent`);
      return true;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.headers ? { headers: mail.headers } : {}),
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send "${mail.subject}" to ${to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
