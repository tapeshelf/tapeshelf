/** Anonymous links to a shelf: their codes, limits and how the API names them. */

/** The alphabet of video codes: no look-alikes, lower case. */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const ANONYMOUS_CODE_LENGTH = 10;
export const ANONYMOUS_CODE = /^[2-9a-hjkmnp-z]{10}$/;
/** Links one person keeps at once. */
export const ANONYMOUS_MAX_LINKS = 20;
export const ANONYMOUS_NOTE_MAX = 100;

/**
 * Where the API takes a username, an anonymous link goes as `~<code>`: the same calls open the
 * shelf, its videos and requests through it. In what the API returns, `~<code>` names a person
 * known by their link (their page is /p/<code>), and `~` alone one whose link no longer opens.
 */
export const HANDLE_MARK = '~';

export function anonymousHandle(code: string | null): string {
  return HANDLE_MARK + (code ?? '');
}

/** The code in a `~<code>` handle, normalized; null for a username or a malformed handle. */
export function anonymousCodeOf(handle: string): string | null {
  if (!handle.startsWith(HANDLE_MARK)) return null;
  const code = handle.slice(HANDLE_MARK.length).toLowerCase();
  return ANONYMOUS_CODE.test(code) ? code : null;
}

export function newAnonymousCode(random: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < ANONYMOUS_CODE_LENGTH; i++)
    code += ALPHABET[random(ALPHABET.length)];
  return code;
}

export const ANONYMOUS_NAME_MAX = 50;

/** Letters and digits only, lower case: "Ivan_K" and "ivan k" read the same. */
function flat(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Whether a name gives away one of these nicknames, case and separators aside: a display
 * name is the nickname unless its owner changed it, and an old nickname still leads to the page.
 */
export function namesNickname(name: string, nicknames: string[]): boolean {
  const n = flat(name);
  return nicknames.some((u) => {
    const f = flat(u);
    return f.length > 0 && n.includes(f);
  });
}

/**
 * The name someone goes by through their anonymous link: the link's own, else their display name
 * unless it gives their nickname away, else none (the reader's word for "Anonymous").
 */
export function personaName(
  link: { name: string | null },
  owner: { displayName: string; nicknames: string[] },
): string {
  if (link.name) return link.name;
  return namesNickname(owner.displayName, owner.nicknames)
    ? ''
    : owner.displayName;
}

/**
 * How a notification names someone known by an anonymous link: by the link's name, or
 * marked `anonymous` for the reader's word for it when the link has none.
 */
export function anonymousName(name: string | null | undefined): {
  fromName: string;
  anonymous?: true;
} {
  return name ? { fromName: name } : { fromName: '', anonymous: true };
}
