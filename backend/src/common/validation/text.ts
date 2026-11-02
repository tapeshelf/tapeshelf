/**
 * Free text from users: trimmed before it is checked, so a value of spaces alone is empty and a
 * required field rejects it (a blank name or title is never stored).
 */
export const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** The first `max` characters, never cutting an emoji or another surrogate pair in half. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
}
