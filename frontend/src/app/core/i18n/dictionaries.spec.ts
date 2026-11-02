import { describe, expect, it } from 'vitest';

import en from '../../../../public/i18n/en.json';
import ru from '../../../../public/i18n/ru.json';
import esDict from '../../../../public/i18n/es.json';
import ptDict from '../../../../public/i18n/pt.json';
import frDict from '../../../../public/i18n/fr.json';
import deDict from '../../../../public/i18n/de.json';
import itDict from '../../../../public/i18n/it.json';
import plDict from '../../../../public/i18n/pl.json';
import ukDict from '../../../../public/i18n/uk.json';
import trDict from '../../../../public/i18n/tr.json';
import nlDict from '../../../../public/i18n/nl.json';
import csDict from '../../../../public/i18n/cs.json';
import svDict from '../../../../public/i18n/sv.json';
import jaDict from '../../../../public/i18n/ja.json';
import koDict from '../../../../public/i18n/ko.json';
import zhDict from '../../../../public/i18n/zh.json';
import idDict from '../../../../public/i18n/id.json';
import viDict from '../../../../public/i18n/vi.json';
import thDict from '../../../../public/i18n/th.json';
import hiDict from '../../../../public/i18n/hi.json';
import adminEn from '../../../../../backend/src/i18n/admin-ui/en.json';
import adminRu from '../../../../../backend/src/i18n/admin-ui/ru.json';

interface Dict {
  [key: string]: string | Dict;
}

/** Every leaf as `path → text`. */
function flatten(dict: Dict, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

/** `{{param}}` and the number of an ICU plural part (`{count, plural, …}`) are both parameters. */
const placeholders = (text: string) =>
  [
    ...new Set([
      ...[...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]),
      ...[...text.matchAll(/\{\s*(\w+)\s*,\s*plural\s*,/g)].map((m) => m[1]),
    ]),
  ].sort();

/**
 * Kept as a test: the two dictionaries never drift apart — the public
 * ones and the admin panel's, which the API gives to admins only.
 */
describe.each([
  { name: 'public', enDict: en as Dict, ruDict: ru as Dict },
  { name: 'admin panel', enDict: adminEn as Dict, ruDict: adminRu as Dict },
])('translation dictionaries ($name)', ({ enDict, ruDict }) => {
  const enKeys = flatten(enDict);
  const ruKeys = flatten(ruDict);

  it('have the same keys', () => {
    expect([...ruKeys.keys()].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys.keys()].filter((k) => !ruKeys.has(k))).toEqual([]);
  });

  it('have no empty texts', () => {
    const empty = [...enKeys, ...ruKeys].filter(([, text]) => !text.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it('use the same placeholders in both languages', () => {
    const mismatched = [...enKeys]
      .filter(([key, text]) => {
        const other = ruKeys.get(key);
        return other !== undefined && placeholders(text).join() !== placeholders(other).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('give every plural part a general form', () => {
    const broken = [...enKeys, ...ruKeys]
      .filter(([, text]) => /\{\s*\w+\s*,\s*plural\s*,/.test(text) && !/\bother\s*\{/.test(text))
      .map(([key]) => key);
    expect(broken).toEqual([]);
  });

  it('do not leave English in the Russian dictionary by accident', () => {
    // Identical texts are fine for brand names, codes, strings made of placeholders, numbers and
    // the brand (the footer's "© {{year}} TapeShelf"), the plan names (Free, Pro) and language
    // names (each named in itself).
    const allowed =
      /^(?:Email|ffprobe|Free|(?:\{\{\w+\}\}|[\d\s\W]|TapeShelf|tapeshelf)*|[A-Z]{2,}.*|.{0,3})$/;
    const same = [...enKeys]
      .filter(([key]) => !key.startsWith('languages.'))
      .filter(([key, text]) => ruKeys.get(key) === text && !allowed.test(text))
      .map(([key, text]) => `${key}: ${text}`);
    expect(same).toEqual([]);
  });
});

describe('public dictionaries', () => {
  it('say nothing about the admin panel (its texts come from the API)', () => {
    expect(Object.keys(en)).not.toContain('admin');
    expect(Object.keys(ru)).not.toContain('admin');
  });
});

/**
 * The other eighteen languages against English: the same keys, nothing empty, the same
 * parameters, every plural part with its general form. (Their plural forms per language are
 * checked by tools/i18n/check-app.mjs.)
 */
describe.each([
  { lang: 'es', dict: esDict as Dict },
  { lang: 'pt', dict: ptDict as Dict },
  { lang: 'fr', dict: frDict as Dict },
  { lang: 'de', dict: deDict as Dict },
  { lang: 'it', dict: itDict as Dict },
  { lang: 'pl', dict: plDict as Dict },
  { lang: 'uk', dict: ukDict as Dict },
  { lang: 'tr', dict: trDict as Dict },
  { lang: 'nl', dict: nlDict as Dict },
  { lang: 'cs', dict: csDict as Dict },
  { lang: 'sv', dict: svDict as Dict },
  { lang: 'ja', dict: jaDict as Dict },
  { lang: 'ko', dict: koDict as Dict },
  { lang: 'zh', dict: zhDict as Dict },
  { lang: 'id', dict: idDict as Dict },
  { lang: 'vi', dict: viDict as Dict },
  { lang: 'th', dict: thDict as Dict },
  { lang: 'hi', dict: hiDict as Dict },
])('the $lang dictionary', ({ dict }) => {
  const enKeys = flatten(en as Dict);
  const keys = flatten(dict);

  it('has the same keys as English', () => {
    expect([...keys.keys()].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys.keys()].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('has no empty texts', () => {
    expect([...keys].filter(([, text]) => !text.trim()).map(([k]) => k)).toEqual([]);
  });

  it('uses the same placeholders as English', () => {
    const mismatched = [...enKeys]
      .filter(([key, text]) => {
        const other = keys.get(key);
        return other !== undefined && placeholders(text).join() !== placeholders(other).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('gives every plural part a general form', () => {
    const broken = [...keys]
      .filter(([, text]) => /\{\s*\w+\s*,\s*plural\s*,/.test(text) && !/\bother\s*\{/.test(text))
      .map(([key]) => key);
    expect(broken).toEqual([]);
  });
});
