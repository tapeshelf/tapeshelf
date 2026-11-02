import { describe, expect, it } from 'vitest';

import type { BillingPriceDto } from '../../api';
import { formatMoney, yearlyOffer } from './pro-pricing';

const month: BillingPriceDto = { id: 'pri_m', interval: 'month', amount: 999, currency: 'EUR' };
const year: BillingPriceDto = { id: 'pri_y', interval: 'year', amount: 5999, currency: 'EUR' };

describe('Pro pricing', () => {
  it('a year at €59.99 is €5 a month and saves 50 % (€59.89) against monthly', () => {
    const offer = yearlyOffer(month, year);
    expect(offer).toEqual({ perMonth: 500, savings: 5989, percent: 50 });
    expect(formatMoney(offer.perMonth, 'EUR', 'en')).toBe('€5');
    expect(formatMoney(offer.savings, 'EUR', 'en')).toBe('€59.89');
    expect(formatMoney(year.amount, 'EUR', 'en')).toBe('€59.99');
    expect(formatMoney(month.amount, 'EUR', 'en')).toBe('€9.99');
  });

  it('formats in the reader’s language', () => {
    expect(formatMoney(999, 'EUR', 'ru')).toMatch(/^9,99\s€$/);
    expect(formatMoney(500, 'EUR', 'ru')).toMatch(/^5\s€$/);
  });

  it('a year dearer than twelve months saves nothing', () => {
    expect(yearlyOffer(month, { ...year, amount: 13000 })).toMatchObject({
      savings: 0,
      percent: 0,
    });
  });
});
