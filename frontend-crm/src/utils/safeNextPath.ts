/**
 * Where to go after signing in: the `?next=` value of the login URL when it is a path inside the CRM
 * (`/connected-calendars`), else the fallback. Never another origin: `//evil.example`, `/\evil.example`,
 * `https://…`, `javascript:` and control characters are refused (no open redirect). Pure.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
    if (!value || value.length > 512) return fallback;
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
    if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
    try {
        const url = new URL(value, 'http://crm.invalid');
        if (url.origin !== 'http://crm.invalid') return fallback;
        // The login page itself would loop.
        if (url.pathname === '/login') return fallback;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

/** `safeNextPath` of the current URL's `?next=` (browser only). */
export function nextPathFromLocation(fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    return safeNextPath(new URLSearchParams(window.location.search).get('next'), fallback);
}
