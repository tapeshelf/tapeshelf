/**
 * What a native app says about itself in `X-Tapeshelf-Client`:
 * `android/1.2.3 (Pixel 8; Android 15)` — the platform, the app's version and, optionally, the
 * device. Browsers do not send the header.
 */
export const CLIENT_HEADER = 'x-tapeshelf-client';

export type ClientPlatform = 'android' | 'ios';

export interface AppClient {
  platform: ClientPlatform;
  version: [number, number, number];
  /** The header as it came, for the list of sessions. */
  raw: string;
}

/**
 * Grows by one whenever the API gains something an app may rely on. An app that meets a server
 * with a smaller number than it needs says so instead of failing halfway.
 */
export const API_LEVEL = 1;

/**
 * The oldest app the server still talks to, per platform; null while there is no such limit.
 * Raise it in the same change that removes or renames something older apps use: until then the
 * API only grows.
 */
export const MIN_CLIENT: Record<ClientPlatform, string | null> = {
  android: '0.1.0',
  ios: null,
};

const HEADER =
  /^(android|ios)\/(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?: \([\x20-\x7e]{1,90}\))?$/;

/** Null for a missing header and for anything that is not written as above. */
export function parseClient(header: unknown): AppClient | null {
  if (typeof header !== 'string' || header.length > 120) return null;
  const m = HEADER.exec(header);
  if (!m) return null;
  return {
    platform: m[1] as ClientPlatform,
    version: [Number(m[2]), Number(m[3]), Number(m[4])],
    raw: header,
  };
}

export function isOlderThan(
  version: readonly [number, number, number],
  min: string,
): boolean {
  const limit = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (version[i]! !== limit[i]!) return version[i]! < limit[i]!;
  }
  return false;
}

/** The version this app has to reach before the server talks to it; null when it is new enough. */
export function requiredUpdate(client: AppClient): string | null {
  const min = MIN_CLIENT[client.platform];
  return min && isOlderThan(client.version, min) ? min : null;
}
