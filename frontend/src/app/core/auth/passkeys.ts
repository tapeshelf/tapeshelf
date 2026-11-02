/**
 * The browser's half of passkeys, loaded only when one is used. Null when the
 * person closed the browser's window or it timed out: nothing to tell them then.
 */
export async function createPasskey(options: object): Promise<Record<string, unknown> | null> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  return quietly(() =>
    startRegistration({
      optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'],
    }),
  );
}

export async function usePasskey(options: object): Promise<Record<string, unknown> | null> {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  return quietly(() =>
    startAuthentication({
      optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
    }),
  );
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** A name for a new passkey: the kind of device it was made on (Android's agent says Linux too). */
export function deviceName(userAgent = navigator.userAgent): string {
  const devices: [string, string][] = [
    ['iPhone', 'iPhone'],
    ['iPad', 'iPad'],
    ['Android', 'Android'],
    ['CrOS', 'ChromeOS'],
    ['Mac', 'Mac'],
    ['Windows', 'Windows'],
    ['Linux', 'Linux'],
  ];
  return devices.find(([mark]) => userAgent.includes(mark))?.[1] ?? 'Passkey';
}

async function quietly<T extends object>(
  run: () => Promise<T>,
): Promise<Record<string, unknown> | null> {
  try {
    return (await run()) as unknown as Record<string, unknown>;
  } catch (e) {
    const name =
      (e as { name?: string; cause?: { name?: string } }).cause?.name ?? (e as Error).name;
    if (name === 'NotAllowedError' || name === 'AbortError') return null;
    throw e;
  }
}
