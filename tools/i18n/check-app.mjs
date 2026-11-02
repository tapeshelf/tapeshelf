// Checks one language of the app's dictionary against English:
//   node tools/i18n/check-app.mjs <lang>
// Same keys, no empty texts, the same {{params}}, ICU plural parts with exactly the forms the
// language has (Intl.PluralRules) plus "other", balanced braces.
import { readFileSync } from 'node:fs';

const lang = process.argv[2];
if (!lang) throw new Error('usage: check-app.mjs <lang>');
const root = new URL('../../frontend/public/i18n/', import.meta.url);
const en = JSON.parse(readFileSync(new URL('en.json', root), 'utf8'));
const other = JSON.parse(readFileSync(new URL(`${lang}.json`, root), 'utf8'));

const flat = (node, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out.set(key, String(v));
  }
  return out;
};
const E = flat(en);
const O = flat(other);
// A text's parameters: its {{params}} and the numbers of its plural parts — a language may write
// "{{count}} дн." where English needs "{count, plural, …}".
const params = (s) =>
  [
    ...new Set([
      ...[...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]),
      ...[...s.matchAll(/\{\s*(\w+)\s*,\s*plural\s*,/g)].map((m) => m[1]),
    ]),
  ]
    .sort()
    .join(',');
const categories = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories);
const problems = [];
const warnings = [];

function forms(text) {
  const out = [];
  const START = /\{\s*(\w+)\s*,\s*plural\s*,/g;
  let m;
  while ((m = START.exec(text))) {
    let depth = 0;
    let end = -1;
    for (let i = m.index; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) return null;
    const body = text.slice(m.index + m[0].length, end);
    out.push(
      [...body.matchAll(/(?:^|\})\s*(=\d+|zero|one|two|few|many|other)\s*\{/g)].map((x) => x[1]),
    );
  }
  return out;
}

for (const k of E.keys()) if (!O.has(k)) problems.push(`missing ${k}`);
for (const k of O.keys()) if (!E.has(k)) problems.push(`extra ${k}`);
for (const [k, v] of O) {
  if (!v.trim()) problems.push(`empty ${k}`);
  const e = E.get(k);
  if (e === undefined) continue;
  if (params(e) !== params(v))
    problems.push(`params differ in ${k}: en {${params(e)}} vs {${params(v)}}`);
  const depth = [...v].reduce((d, c) => (d < 0 ? d : c === '{' ? d + 1 : c === '}' ? d - 1 : d), 0);
  if (depth !== 0) problems.push(`unbalanced braces in ${k}`);
  const f = forms(v);
  if (f === null) problems.push(`broken plural in ${k}`);
  else
    for (const used of f) {
      if (!used.includes('other')) problems.push(`plural without "other" in ${k}`);
      // A missing form falls back to "other": allowed, worth a look.
      for (const c of categories)
        if (!used.includes(c)) warnings.push(`plural lacks "${c}" in ${k}`);
      for (const c of used)
        if (!c.startsWith('=') && !categories.has(c))
          warnings.push(`plural has "${c}", unused in ${lang}, in ${k}`);
    }
}
if (warnings.length)
  console.warn(`${warnings.length} warning(s), e.g.\n  ${warnings.slice(0, 10).join('\n  ')}`);
if (problems.length) {
  console.error(problems.slice(0, 80).join('\n'));
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`app ${lang}: ok, ${O.size} texts, plural forms ${[...categories].join('/')}`);
