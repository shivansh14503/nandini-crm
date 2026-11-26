/**
 * A short, human name for a browser's User-Agent string ("Chrome on Windows"), for the "Where you're signed in" list.
 * Pure: no lookups, no dependencies. Good enough to tell sessions apart; not meant for analytics.
 */

const UNKNOWN_DEVICE = 'Unknown device';

/** Browser by its UA token. Order matters: Edge, Opera and Samsung Internet also say "Chrome", Chrome also says "Safari". */
const BROWSERS: [name: string, pattern: RegExp][] = [
    ['Edge', /\bEdg(?:e|A|iOS)?\//],
    ['Opera', /\b(?:OPR|Opera|OPiOS)\//],
    ['Samsung Internet', /\bSamsungBrowser\//],
    ['Firefox', /\b(?:Firefox|FxiOS)\//],
    ['Chrome', /\b(?:Chrome|CriOS)\//],
    ['Safari', /\bVersion\/[\d.]+.*\bSafari\//],
];

/** Operating system. Order matters: iPadOS / iOS and Android also mention "Mac OS X" / "Linux"; ChromeOS says "X11". */
function operatingSystem(ua: string): string | null {
    if (/\biPad\b/.test(ua)) return 'iPadOS';
    if (/\b(?:iPhone|iPod)\b/.test(ua)) return 'iOS';
    if (/\bAndroid\b/.test(ua)) return 'Android';
    if (/\bCrOS\b/.test(ua)) return 'ChromeOS';
    if (/\bWindows\b/.test(ua)) return 'Windows';
    // iPadOS 13+ Safari asks for the desktop site and reports itself as a Mac; touch support isn't in the UA, so it
    // reads as macOS here.
    if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'macOS';
    if (/\bLinux\b|\bX11\b/.test(ua)) return 'Linux';
    return null;
}

/** "Chrome on Windows", "Safari on iOS", "Firefox", "Android device", or "Unknown device". */
export function describeUserAgent(ua: string | null | undefined): string {
    const value = (ua ?? '').trim();
    if (!value) return UNKNOWN_DEVICE;
    const browser = BROWSERS.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
    const os = operatingSystem(value);
    if (browser && os) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return `${os} device`;
    return UNKNOWN_DEVICE;
}
