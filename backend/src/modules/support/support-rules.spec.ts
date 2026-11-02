import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { parseFaq, SupportFaqService } from './support-faq.service.js';
import {
  afterAuthorMessage,
  afterSupportAnswer,
  canRate,
  cleanContext,
  closeBefore,
  decodeCursor,
  encodeCursor,
  isOver,
  ticketNumber,
} from './support-rules.js';

const DAY = 24 * 60 * 60_000;
const NOW = new Date('2026-10-19T12:00:00.000Z');

describe('support rules', () => {
  it('the author writing brings an open ticket back to support; a solved or closed one is over', () => {
    expect(afterAuthorMessage('OPEN')).toBe('OPEN');
    expect(afterAuthorMessage('WAITING')).toBe('OPEN');
    expect(afterAuthorMessage('RESOLVED')).toBeNull();
    expect(afterAuthorMessage('CLOSED')).toBeNull();
    expect(
      ['OPEN', 'WAITING', 'RESOLVED', 'CLOSED'].filter((s) =>
        isOver(s as never),
      ),
    ).toEqual(['RESOLVED', 'CLOSED']);
  });

  it('an answer waits for the author or solves; a rating only once solved or closed', () => {
    expect(afterSupportAnswer(false)).toBe('WAITING');
    expect(afterSupportAnswer(true)).toBe('RESOLVED');
    expect(
      ['OPEN', 'WAITING', 'RESOLVED', 'CLOSED'].filter((s) =>
        canRate(s as never),
      ),
    ).toEqual(['RESOLVED', 'CLOSED']);
    expect(closeBefore(NOW).getTime()).toBe(NOW.getTime() - 7 * DAY);
  });

  it('keeps a flat object of short strings from what the browser sent', () => {
    expect(cleanContext(undefined)).toBeNull();
    expect(cleanContext('not json')).toBeNull();
    expect(cleanContext('[1,2]')).toBeNull();
    expect(
      cleanContext(
        JSON.stringify({
          browser: 'Firefox 140',
          dpr: 2,
          dark: true,
          nested: { a: 1 },
          'bad key': 'x',
          long: 'x'.repeat(400),
        }),
      ),
    ).toEqual({
      browser: 'Firefox 140',
      dpr: '2',
      dark: 'true',
      long: 'x'.repeat(300),
    });
  });

  it('reads ticket numbers and list cursors', () => {
    expect(ticketNumber('#12')).toBe(12);
    expect(ticketNumber(' 7 ')).toBe(7);
    expect(ticketNumber('12a')).toBeNull();
    const id = '0199d1c0-0000-7000-8000-000000000007';
    expect(decodeCursor(encodeCursor(NOW, id))).toEqual({ at: NOW, id });
    expect(decodeCursor('garbage')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('takes from the site’s FAQ only well-formed questions', () => {
    expect(parseFaq({ not: 'a list' })).toEqual([]);
    expect(
      parseFaq([
        {
          key: 'free',
          question: 'Is it free?',
          answer: 'Yes.',
          url: 'https://x/faq#free',
        },
        {
          key: 'bad',
          question: 'No link',
          answer: 'x',
          url: 'javascript:alert(1)',
        },
        { key: 'empty', question: ' ', answer: 'x', url: 'https://x' },
        null,
      ]),
    ).toEqual([
      {
        key: 'free',
        question: 'Is it free?',
        answer: 'Yes.',
        url: 'https://x/faq#free',
      },
    ]);
  });

  it('asks the site for the FAQ of a language under its prefix: Ukrainian under /ua', async () => {
    const fetch = vi.fn(async (_url: string) => Response.json([]));
    vi.stubGlobal('fetch', fetch);
    try {
      const config = { get: () => 'https://site.test/' };
      const faq = new SupportFaqService(
        config as unknown as ConfigService<Env, true>,
      );
      for (const lang of ['en', 'ru', 'uk']) await faq.list(lang);
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://site.test/faq.json',
        'https://site.test/ru/faq.json',
        'https://site.test/ua/faq.json',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
