import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  toSupportedLocale,
} from '../../common/i18n/i18n.js';
import type { Env } from '../../config/env.js';
import type { SupportFaqItemDto } from './support.dto.js';

/** The site's FAQ changes with its releases: an hour is fresh enough. */
const TTL_MS = 60 * 60_000;
/** After a failed fetch, the next try waits this long (the form works without hints). */
const RETRY_MS = 5 * 60_000;
const TIMEOUT_MS = 3000;
/** The site's path prefix of a language where it is not the code: Ukrainian is under /ua. */
const SITE_PREFIX: Partial<Record<SupportedLocale, string>> = { uk: 'ua' };

/**
 * Questions of the operator site's FAQ (`SITE_URL/faq.json`, `/ru/faq.json`), suggested while a
 * ticket's subject is typed. No site (a self-hosted instance without one): no hints.
 */
@Injectable()
export class SupportFaqService {
  private readonly logger = new Logger(SupportFaqService.name);
  private readonly siteUrl: string | null;
  private readonly cache = new Map<
    string,
    { until: number; items: SupportFaqItemDto[] }
  >();

  constructor(config: ConfigService<Env, true>) {
    this.siteUrl =
      config.get('SITE_URL', { infer: true })?.replace(/\/$/, '') ?? null;
  }

  async list(locale: string | null | undefined): Promise<SupportFaqItemDto[]> {
    if (!this.siteUrl) return [];
    const lang = toSupportedLocale(locale);
    const hit = this.cache.get(lang);
    if (hit && hit.until > Date.now()) return hit.items;
    const prefix =
      lang === DEFAULT_LOCALE ? '' : `/${SITE_PREFIX[lang] ?? lang}`;
    const url = `${this.siteUrl}${prefix}/faq.json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFaq(await res.json());
      this.cache.set(lang, { until: Date.now() + TTL_MS, items });
      return items;
    } catch (err) {
      this.logger.warn(
        `FAQ from ${url} is unavailable: ${(err as Error).message}`,
      );
      const items = hit?.items ?? [];
      this.cache.set(lang, { until: Date.now() + RETRY_MS, items });
      return items;
    }
  }
}

/** What the site sent, kept only where it has the expected shape. */
export function parseFaq(raw: unknown): SupportFaqItemDto[] {
  if (!Array.isArray(raw)) return [];
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  const out: SupportFaqItemDto[] = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const key = text(r['key'], 60);
    const question = text(r['question'], 300);
    const answer = text(r['answer'], 2000);
    const url = text(r['url'], 500);
    if (!key || !question || !answer || !url || !/^https?:\/\//.test(url))
      continue;
    out.push({ key, question, answer, url });
  }
  return out;
}
