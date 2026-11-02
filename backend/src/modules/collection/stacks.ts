/**
 * Rules of stacks that need no database: which category a stack ends up with, and
 * how its videos are gathered into one place of the manual order.
 */

export type StackCategory =
  | { ok: true; categoryId: string | null }
  | { ok: false; categories: (string | null)[] };

/**
 * A stack keeps one category: all its videos share it, or none has one. `instruction` is a category
 * the user chose for the whole stack (null = no category); without it, the members must already
 * agree.
 */
export function stackCategory(
  members: readonly (string | null)[],
  instruction?: string | null,
): StackCategory {
  if (instruction !== undefined) return { ok: true, categoryId: instruction };
  const distinct = [...new Set(members)];
  if (distinct.length <= 1)
    return { ok: true, categoryId: distinct[0] ?? null };
  return { ok: false, categories: distinct };
}

/**
 * The manual order with `head` and `tail` gathered into one block where the first of `head` was:
 * a new stack lands where the video it was dropped on sat, videos added to a stack line up behind
 * the ones already in it. Ids not in `order` are ignored; everything else keeps its relative order.
 */
export function gather(
  order: readonly string[],
  head: readonly string[],
  tail: readonly string[],
): string[] {
  const present = new Set(order);
  const block = [...head, ...tail].filter(
    (id, i, all) => present.has(id) && all.indexOf(id) === i,
  );
  if (block.length === 0) return [...order];
  const moving = new Set(block);
  const rest = order.filter((id) => !moving.has(id));
  const anchor = order.indexOf(block[0]!);
  const at = order.slice(0, anchor).filter((id) => !moving.has(id)).length;
  rest.splice(at, 0, ...block);
  return rest;
}
