/** What a cleanup of titles does; each step can be turned off. */
export interface TitleCleanup {
  /** "Summer-on_the.lake" → "Summer on the lake": underscores, and dots or dashes between letters. */
  separators: boolean;
  /** A trailing extension, and words of the file's making: 1080p, 4K, x264, WEB-DL, [site.com]… */
  junk: boolean;
  /** The first letter in capitals. */
  capitalize: boolean;
  /** Plain text to find (case aside) and what to put instead; empty `find`: nothing. */
  find: string;
  replace: string;
}

export const DEFAULT_CLEANUP: TitleCleanup = {
  separators: true,
  junk: true,
  capitalize: true,
  find: '',
  replace: '',
};

/** Words a recorder or a downloader adds to a file's name, not part of its title. */
const JUNK =
  /\b(?:2160p|1440p|1080p|720p|480p|360p|240p|4k|8k|uhd|fhd|hd|sd|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|mp3|webrip|web-?dl|web|bluray|blu-ray|brrip|bdrip|hdrip|dvdrip|hdtv|remux|60fps|30fps)\b/gi;
const EXTENSION = /\.(?:mp4|m4v|mov|mkv|avi|webm|wmv|flv|mpe?g|3gp|ts)$/i;
/** Brackets around something that names a site or the file's making: "[YTS.MX]", "(1080p)". */
const NOISY_BRACKETS =
  /[[(][^\])]*(?:\.(?:com|net|org|tv|me|io|mx|ru)|www\.|1080p|720p|4k|x26[45])[^\])]*[\])]/gi;

/**
 * A tidier title: the same words, without what made it a file name. Never empty: when the
 * cleanup would leave nothing, the title stays as it was.
 */
export function cleanTitle(raw: string, o: TitleCleanup = DEFAULT_CLEANUP): string {
  let t = raw;
  if (o.find) t = replaceAll(t, o.find, o.replace);
  // Before the separators go: "WEB-DL" is one word only while its dash is there.
  if (o.junk) t = t.replace(EXTENSION, '').replace(NOISY_BRACKETS, ' ').replace(JUNK, ' ');
  if (o.separators) {
    t = t
      .replace(/_+/g, ' ')
      .replace(/(?<=\p{L})[.-]+(?=\p{L})/gu, ' ')
      .replace(/(?<=\p{L})\.(?=\d)|(?<=\d)\.(?=\p{L})/gu, ' ');
  }
  if (o.junk) t = t.replace(JUNK, ' ');
  t = t
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—_.,;:|]+|[\s\-–—_.,;:|]+$/g, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .trim();
  if (o.capitalize && t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t || raw.trim();
}

function replaceAll(text: string, find: string, replace: string): string {
  const pattern = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(pattern, replace);
}
