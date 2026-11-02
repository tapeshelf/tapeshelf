import type { SupportFaqItemDto } from '../../api';

/** Words of at least three letters, lower case; the first four letters stand for the word. */
function stems(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).map((w) => w.slice(0, 4));
}

/**
 * The FAQ questions closest to what is typed in a subject: each word that starts like a
 * word of the question counts, a question's own words twice as much as its answer's. Russian
 * endings change a lot, so words compare by their first letters. Nothing under three letters typed,
 * nothing suggested.
 */
export function matchFaq(
  subject: string,
  items: readonly SupportFaqItemDto[],
  limit: number,
): SupportFaqItemDto[] {
  const typed = [...new Set(stems(subject))];
  if (!typed.length) return [];
  return items
    .map((item, order) => {
      const question = new Set(stems(item.question));
      const answer = new Set(stems(item.answer));
      const score = typed.reduce(
        (sum, w) => sum + (question.has(w) ? 2 : answer.has(w) ? 1 : 0),
        0,
      );
      return { item, score, order };
    })
    .filter((m) => m.score >= Math.min(2, typed.length))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((m) => m.item);
}
