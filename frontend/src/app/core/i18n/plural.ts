/**
 * The plural part of ICU messages in the dictionaries:
 * `{count, plural, one {# video} other {# videos}}` picks the form for the number in `count` by the
 * language's plural rules (Intl.PluralRules: English one/other, Russian one/few/many) and puts the
 * number in place of `#`. `=0`-style exact forms win over the rule. The `{{param}}` interpolation of
 * Transloco runs afterwards, so forms may use it. Without plural parts a text is returned as is.
 */
const START = /\{\s*(\w+)\s*,\s*plural\s*,/g;
const FORM = /\s*(=\d+|zero|one|two|few|many|other)\s*\{/y;

export function pluralize(text: string, params: Record<string, unknown>, lang: string): string {
  if (!text.includes('plural')) return text;
  let out = '';
  let from = 0;
  for (;;) {
    START.lastIndex = from;
    const m = START.exec(text);
    if (!m) return out + text.slice(from);
    const end = closing(text, m.index);
    if (end < 0) return out + text.slice(from);
    const forms = formsOf(text.slice(m.index + m[0].length, end));
    const n = Number(params[m[1]!]);
    out += text.slice(from, m.index) + (pick(forms, n, lang) ?? '').replace(/#/g, format(n, lang));
    from = end + 1;
  }
}

/** Index of the brace closing the one at `open` (nested `{{param}}` included). */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function formsOf(body: string): Map<string, string> {
  const forms = new Map<string, string>();
  let at = 0;
  for (;;) {
    FORM.lastIndex = at;
    const m = FORM.exec(body);
    if (!m) return forms;
    const start = FORM.lastIndex;
    const end = closing(body, start - 1);
    if (end < 0) return forms;
    forms.set(m[1]!, body.slice(start, end));
    at = end + 1;
  }
}

function pick(forms: Map<string, string>, n: number, lang: string): string | undefined {
  if (!Number.isFinite(n)) return forms.get('other');
  return forms.get(`=${n}`) ?? forms.get(rules(lang).select(n)) ?? forms.get('other');
}

const cache = new Map<string, Intl.PluralRules>();
function rules(lang: string): Intl.PluralRules {
  let r = cache.get(lang);
  if (!r) cache.set(lang, (r = new Intl.PluralRules(lang)));
  return r;
}

function format(n: number, lang: string): string {
  return Number.isFinite(n) ? n.toLocaleString(lang) : '';
}
