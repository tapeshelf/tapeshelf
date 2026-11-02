import AxeBuilder from '@axe-core/playwright';
import { type Page, expect } from '@playwright/test';

/**
 * Accessibility check: axe (WCAG 2.1 A/AA) on the current page. Serious and critical
 * findings fail the test (softly, so one run lists them all); the rest is printed for review.
 */
export async function audit(page: Page, name: string): Promise<void> {
  // Right after a navigation the dictionaries may still be loading (labels are empty for a moment);
  // under a loaded CI machine axe used to catch that moment.
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of result.violations)
    console.log(
      `[a11y] ${name}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.nodes
        .slice(0, 3)
        .map(
          (n) =>
            `${n.target.join(' ')} ${n.html.slice(0, 140)} :: ${n.failureSummary?.split('\n')[1] ?? ''}`,
        )
        .join(' | ')}`,
    );
  expect
    .soft(
      bad.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      name,
    )
    .toEqual([]);
  // Everything clickable shows the hand; a drag handle may show the grab cursor.
  const arrows = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), summary, [role=button], [role=checkbox], [role=option], [role=menuitem], [role=tab], input[type=checkbox]:not(:disabled)',
      ),
    ]
      .filter((e) => e.getClientRects().length > 0)
      .filter((e) => !['pointer', 'grab'].includes(getComputedStyle(e).cursor))
      .map(
        (e) =>
          `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40)}" → ${getComputedStyle(e).cursor}`,
      ),
  );
  expect.soft(arrows, `${name}: clickable without the pointer cursor`).toEqual([]);
}
