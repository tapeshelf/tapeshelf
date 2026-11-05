import { API_LEVEL, MIN_CLIENT } from '../../common/client-version.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { StorageService } from '../../infra/storage/storage.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { DEFAULT_LOCALE, toSupportedLocale } from '../../common/i18n/i18n.js';
import type { Env } from '../../config/env.js';
import { SignupCaptchaService } from '../captcha/signup-captcha.service.js';
import { readServiceAccount } from '../notifications/fcm.js';
import { DEMO_ACCOUNT } from '../demo/demo.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { PlansService } from '../plans/plans.service.js';
import {
  LEGAL_DOCS,
  type LegalDoc,
  type LegalDocDto,
  type SiteInfoDto,
} from './site.dto.js';

/** Legal texts are prose, not media: anything larger is a mistake in LEGAL_DIR. */
const MAX_LEGAL_BYTES = 512 * 1024;

@Injectable()
export class SiteService {
  private readonly name: string;
  private readonly contactEmail: string | null;
  private readonly legalDir: string | null;
  private readonly siteUrl: string | null;
  private readonly demo: boolean;
  private readonly emailEnabled: boolean;

  private readonly mediaOrigin: string | null;
  private readonly push: boolean;

  constructor(
    config: ConfigService<Env, true>,
    private readonly plans: PlansService,
    private readonly captcha: SignupCaptchaService,
    private readonly settings: SettingsService,
    storage: StorageService,
  ) {
    let origin: string | null = null;
    try {
      origin = new URL(storage.publicUrl('x')).origin;
    } catch {
      /* a relative public URL: same origin, nothing to preconnect to */
    }
    this.mediaOrigin = origin;
    const fcm = config.get('FCM_SERVICE_ACCOUNT', { infer: true });
    this.push = !!fcm && readServiceAccount(fcm) !== null;
    this.name = config.get('SITE_NAME', { infer: true });
    this.contactEmail = config.get('CONTACT_EMAIL', { infer: true }) ?? null;
    const dir = config.get('LEGAL_DIR', { infer: true });
    this.legalDir = dir ? resolve(dir) : null;
    this.demo = config.get('DEMO_MODE', { infer: true });
    this.emailEnabled = !(
      this.demo || config.get('EMAIL_DISABLED', { infer: true })
    );
    this.siteUrl =
      config.get('SITE_URL', { infer: true })?.replace(/\/$/, '') ?? null;
  }

  async info(): Promise<SiteInfoDto> {
    const [available, plans] = await Promise.all([
      Promise.all(LEGAL_DOCS.map((doc) => this.pathOf(doc, DEFAULT_LOCALE))),
      this.plans.list(),
    ]);
    return {
      name: this.name,
      contactEmail: this.contactEmail,
      siteUrl: this.siteUrl,
      legal: {
        terms: available[0] !== null,
        privacy: available[1] !== null,
        imprint: available[2] !== null,
      },
      edition: plans.edition,
      plans: plans.tiers,
      api: { level: API_LEVEL, minClient: { ...MIN_CLIENT } },
      captchaSiteKey: this.captcha.siteKey,
      demo: this.demo
        ? { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password }
        : null,
      emailEnabled: this.emailEnabled,
      registrationOpen: await this.settings.get('registrationOpen'),
      mediaOrigin: this.mediaOrigin,
      push: this.push,
    };
  }

  /** The document in the asked language, or in English when there is no translation. */
  async legal(doc: string, lang: string | undefined): Promise<LegalDocDto> {
    if (!(LEGAL_DOCS as readonly string[]).includes(doc)) throw notFound();
    const wanted = toSupportedLocale(lang);
    for (const candidate of new Set([wanted, DEFAULT_LOCALE])) {
      const path = await this.pathOf(doc as LegalDoc, candidate);
      if (path) {
        return {
          doc: doc as LegalDoc,
          lang: candidate,
          markdown: await readFile(path, 'utf8'),
        };
      }
    }
    throw notFound();
  }

  /** `<LEGAL_DIR>/<doc>.<lang>.md` when it exists and is a sane size; names come from fixed lists only. */
  private async pathOf(doc: LegalDoc, lang: string): Promise<string | null> {
    if (!this.legalDir) return null;
    const path = join(this.legalDir, `${doc}.${lang}.md`);
    try {
      const s = await stat(path);
      return s.isFile() && s.size <= MAX_LEGAL_BYTES ? path : null;
    } catch {
      return null;
    }
  }
}

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'legalNotFound',
    'errors.site.legalNotFound',
  );
