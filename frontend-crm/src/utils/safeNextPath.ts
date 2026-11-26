// Mirrors ROUTES.LOGIN in '@/config/constants'. Kept local so this file has no imports: the backend contract test
// (backend-crm/src/validators/contractSync.test.ts) loads it with tsx, which cannot resolve the frontend's `@/` alias.
const LOGIN_PATH = '/login';

/**
 * Where to go after signing in: the `?next=` value of the login URL when it is a path inside the CRM
 * (`/profile?tab=connected-accounts`), else the fallback. Never another origin: `//evil.example`, `/\evil.example`,
 * `https://…`, `javascript:`, control characters and dot segments that normalize to `//…` are refused (no open redirect). Pure.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
    if (!value || value.length > 512) return fallback;
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
    if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
    try {
        const url = new URL(value, 'http://crm.invalid');
        if (url.origin !== 'http://crm.invalid') return fallback;
        // Checked again after normalizing: dot segments (`/.//evil.example`, `/%2e//…`, `/a/..//…`) collapse to a
        // protocol-relative `//evil.example`, which the router would open as another site.
        if (url.pathname.startsWith('//') || url.pathname.includes('\\')) return fallback;
        // The login page itself would loop.
        if (url.pathname === LOGIN_PATH) return fallback;
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

/**
 * The sign-in URL for a signed-out visitor: `/login?next=<path>` so signing in comes back to `path` (default: the
 * current page's path, query and hash). Plain `/login` when there is nowhere useful to return to (the root, the login
 * page itself, or a path `safeNextPath` refuses). Used by `useRequireAuth`; an explicit sign-out uses plain `/login`.
 */
export function loginPathWithNext(path?: string): string {
    const here =
        path ?? (typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}${window.location.hash}`);
    const next = safeNextPath(here, '');
    return next && next !== '/' ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH;
}
