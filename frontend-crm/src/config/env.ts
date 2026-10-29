const API_PORT = process.env.NEXT_PUBLIC_API_PORT || '8008';

// Resolve the API host from the page's own hostname so the same build works on
// localhost, LAN IPs and the public server IP. NEXT_PUBLIC_API_URL overrides it.
function resolveApiUrl(): string {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined') {
        return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
    }
    return `http://localhost:${API_PORT}`;
}

export const ENV = {
    get API_URL() {
        return resolveApiUrl();
    },
    USE_MOCK: process.env.NEXT_PUBLIC_USE_MOCK !== 'false',
} as const;
