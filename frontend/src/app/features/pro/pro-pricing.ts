import type { BillingPriceDto } from '../../api';

/**
 * Money as people read it: "€5" for a whole amount, "€59.99" otherwise; amounts are in cents
 * of the price's currency, VAT included.
 */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/**
 * The yearly plan next to the monthly one: what a month costs paid yearly (rounded to the
 * cent: €59.99 / 12 → €5), and what a year saves against twelve monthly payments.
 */
export function yearlyOffer(
  month: BillingPriceDto,
  year: BillingPriceDto,
): { perMonth: number; savings: number; percent: number } {
  const twelve = month.amount * 12;
  const savings = Math.max(0, twelve - year.amount);
  return {
    perMonth: Math.round(year.amount / 12),
    savings,
    percent: twelve > 0 ? Math.round((savings / twelve) * 100) : 0,
  };
}
