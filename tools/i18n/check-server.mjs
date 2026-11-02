// Checks one language of the server's dictionary against English:
//   npx tsx tools/i18n/check-server.mjs <lang>
// Same texts (i18next plural keys counted by their base: name_one/name_few… → name), each plural
// text with exactly the language's forms (Intl.PluralRules), the same {{params}}, nothing empty.
const lang = process.argv[2];
if (!lang) throw new Error('usage: check-server.mjs <lang>');
const { en } = await import('../../backend/src/i18n/en.ts');
const mod = await import(`../../backend/src/i18n/${lang}.ts`);
const other = mod[lang];
if (!other) throw new Error(`backend/src/i18n/${lang}.ts must export const ${lang}`);

const SUFFIX = /_(zero|one|two|few|many|other)$/;
const flat = (node, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out.set(key, String(v));
  }
  return out;
};
const group = (m) => {
  const g = new Map();
  for (const [k, v] of m) {
    const s = SUFFIX.exec(k);
    const base = s ? k.slice(0, -s[0].length) : k;
    const e = g.get(base) ?? { forms: new Set(), texts: [] };
    if (s) e.forms.add(s[1]);
    e.texts.push(v);
    g.set(base, e);
  }
  return g;
};
const E = group(flat(en));
const O = group(flat(other));
const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
const params = (texts) =>
  [...new Set(texts.flatMap((t) => [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])))]
    .sort()
    .join(',');
const problems = [];
for (const k of E.keys()) if (!O.has(k)) problems.push(`missing ${k}`);
for (const k of O.keys()) if (!E.has(k)) problems.push(`extra ${k}`);
for (const [k, o] of O) {
  const e = E.get(k);
  if (!e) continue;
  if (o.texts.some((t) => !t.trim())) problems.push(`empty ${k}`);
  if (e.forms.size) {
    const want = [...categories].sort().join(',');
    const got = [...o.forms].sort().join(',');
    if (want !== got) problems.push(`${k}: plural forms ${got || '(none)'}, ${lang} needs ${want}`);
  } else if (o.forms.size) problems.push(`${k}: plural forms where English has one text`);
  // A form may leave the number out ("a day"), so compare the params of all forms together.
  const pe = params(e.texts)
    .split(',')
    .filter((p) => p !== 'count');
  const po = params(o.texts)
    .split(',')
    .filter((p) => p !== 'count');
  if (pe.join() !== po.join()) problems.push(`params differ in ${k}: en {${pe}} vs {${po}}`);
}
if (problems.length) {
  console.error(problems.slice(0, 80).join('\n'));
  console.error(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`server ${lang}: ok, ${O.size} texts, plural forms ${categories.join('/')}`);
