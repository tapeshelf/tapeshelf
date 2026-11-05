/**
 * How a session started by the phone app is named in the list of sessions. The app says
 * `android/1.4.0 (Pixel 8; Android 15)` about itself (the server's `SessionDto.client`); the list
 * shows `tapeshelf 1.4.0 · Pixel 8 · Android 15`. Only names and numbers: nothing to translate.
 */
export function appSessionLabel(client: string): string {
  const m = /^(android|ios)\/(\d+\.\d+\.\d+)(?: \((.+)\))?$/.exec(client);
  if (!m) return client;
  const device = m[3]
    ? m[3].split(';').map((part) => part.trim())
    : [m[1] === 'android' ? 'Android' : 'iPhone'];
  return [`tapeshelf ${m[2]}`, ...device.filter(Boolean)].join(' · ');
}
