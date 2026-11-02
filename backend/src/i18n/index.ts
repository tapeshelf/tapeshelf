import { en } from './en.js';
import { ru } from './ru.js';
import { es } from './es.js';
import { pt } from './pt.js';
import { fr } from './fr.js';
import { de } from './de.js';
import { it } from './it.js';
import { pl } from './pl.js';
import { uk } from './uk.js';
import { tr } from './tr.js';
import { nl } from './nl.js';
import { cs } from './cs.js';
import { sv } from './sv.js';
import { ja } from './ja.js';
import { ko } from './ko.js';
import { zh } from './zh.js';
import { id } from './id.js';
import { vi } from './vi.js';
import { th } from './th.js';
import { hi } from './hi.js';

/**
 * The server's texts by language (errors, emails, notifications), the app's 20. A text
 * missing from a language falls back to English.
 */
export const SERVER_DICTIONARIES: Record<string, object> = {
  en,
  ru,
  es,
  pt,
  fr,
  de,
  it,
  pl,
  uk,
  tr,
  nl,
  cs,
  sv,
  ja,
  ko,
  zh,
  id,
  vi,
  th,
  hi,
};
