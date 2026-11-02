/**
 * Manual ordering of holdings. `current` is the holder's complete list in its
 * present order; `moved` is a subset in the order the user wants. The moved items take over the slots
 * they currently occupy (as a group), so everything else keeps its place; the result is the complete
 * new order, and callers renumber positions 0..n-1 from it.
 */
export function applyOrder(current: string[], moved: string[]): string[] {
  const movedSet = new Set(moved);
  const wanted = moved.filter(
    (id, i) => current.includes(id) && moved.indexOf(id) === i,
  );
  let next = 0;
  return current.map((id) => (movedSet.has(id) ? wanted[next++]! : id));
}

/**
 * The order with `moved` (kept in their current relative order) taken out and put back right before
 * or after `anchorId`. Unchanged when the anchor is one of them or not in the list.
 */
export function moveAround(
  current: string[],
  moved: ReadonlySet<string>,
  anchorId: string,
  after: boolean,
): string[] {
  if (moved.has(anchorId)) return current;
  const rest = current.filter((id) => !moved.has(id));
  const at = rest.indexOf(anchorId);
  if (at < 0) return current;
  rest.splice(after ? at + 1 : at, 0, ...current.filter((id) => moved.has(id)));
  return rest;
}
