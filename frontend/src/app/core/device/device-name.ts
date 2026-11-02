/**
 * "Chrome on Windows": the browser and system a user agent names, as the list of connected apps
 * shows a connection. Read from the app page that connects, which runs in the same browser
 * as the extension. Unknown parts are left out; nothing at all known gives "Browser".
 */
export function deviceName(ua: string): string {
  const browser = /\bEdg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(ua)
      ? 'Opera'
      : /\bYaBrowser\//.test(ua)
        ? 'Yandex Browser'
        : /\bVivaldi\//.test(ua)
          ? 'Vivaldi'
          : /\bSamsungBrowser\//.test(ua)
            ? 'Samsung Internet'
            : /\bFirefox\/|\bFxiOS\//.test(ua)
              ? 'Firefox'
              : /\bChrome\/|\bCriOS\//.test(ua)
                ? 'Chrome'
                : /\bSafari\//.test(ua)
                  ? 'Safari'
                  : null;
  const system = /\bWindows\b/.test(ua)
    ? 'Windows'
    : /\biPhone|iPad|iPod\b/.test(ua)
      ? 'iOS'
      : /\bMac OS X\b|\bMacintosh\b/.test(ua)
        ? 'macOS'
        : /\bAndroid\b/.test(ua)
          ? 'Android'
          : /\bCrOS\b/.test(ua)
            ? 'ChromeOS'
            : /\bLinux\b/.test(ua)
              ? 'Linux'
              : null;
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? 'Browser';
}
