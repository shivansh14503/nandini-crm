/**
 * Query parameters whose values must never reach a log line: OAuth codes and state, ID tokens, webhook validation
 * tokens, and the provider sync cursors that Google (`syncToken`, `pageToken`) and Microsoft Graph (`$deltatoken`,
 * `$skiptoken`) put in URLs. Compared case-insensitively.
 */
export const REDACTED_URL_PARAMS: readonly string[] = [
    'code',
    'state',
    'id_token',
    'session_state',
    'validationToken',
    'token',
    'syncToken',
    'pageToken',
    '$deltatoken',
    '$skiptoken',
];

const SENSITIVE = new Set(REDACTED_URL_PARAMS.map((name) => name.toLowerCase()));
const MASK = '[REDACTED]';

function decodeName(name: string): string {
    try {
        return decodeURIComponent(name.replace(/\+/g, ' '));
    } catch {
        return name;
    }
}

/**
 * The URL (a path with a query, or an absolute URL) with the values of `REDACTED_URL_PARAMS` replaced by
 * `[REDACTED]`; everything else is left byte for byte, so log lines stay comparable. Pure (redactUrl.test.ts).
 * Used by every request log line (pino-http's `req` serializer and the error handler).
 */
export function redactUrl(url: string | undefined | null): string {
    if (!url) return url ?? '';
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return url;
    const hashStart = url.indexOf('#', queryStart);
    const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
    const hash = hashStart === -1 ? '' : url.slice(hashStart);
    const redacted = query
        .split('&')
        .map((pair) => {
            const eq = pair.indexOf('=');
            const name = eq === -1 ? pair : pair.slice(0, eq);
            if (!SENSITIVE.has(decodeName(name).toLowerCase())) return pair;
            return `${name}=${MASK}`;
        })
        .join('&');
    // A fragment is never sent to the server, but a logged absolute URL could carry one: it is dropped if sensitive.
    const safeHash = hash && /(?:^#|&)(?:access_token|id_token|code|state)=/i.test(hash) ? '#[REDACTED]' : hash;
    return `${url.slice(0, queryStart)}?${redacted}${safeHash}`;
}
