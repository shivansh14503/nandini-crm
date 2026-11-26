import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { describe, it } from 'node:test';
import { pino } from 'pino';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from './logger.js';

/** A pino logger with the app's redact settings, writing JSON lines into memory. */
function capture() {
    const lines: string[] = [];
    const stream = new Writable({
        write(chunk, _enc, done) {
            lines.push(String(chunk));
            done();
        },
    });
    const log = pino({ redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR } }, stream);
    return { log, text: () => lines.join('') };
}

describe('logger redaction', () => {
    it('hides OAuth tokens, client secrets, verifiers, sealed values and sync cursors', () => {
        const { log, text } = capture();
        log.info(
            {
                tokens: { accessToken: 'ya29.A', refreshToken: '1//r', access_token: 'ya29.B', refresh_token: '1//s', id_token: 'eyJ.x.y' },
                provider: { clientSecret: 'GOCSPX-1', client_secret: 'GOCSPX-2', secrets: { clientSecret: 'x' }, secretsEnc: 'enc:v1:k1:a:b:c' },
                oauth: { code_verifier: 'verifier-1' },
                connection: { syncCursor: 'CPDAlvWDx70CEPDAlvWDx70CGAU=' },
                req: { headers: { 'x-goog-channel-token': 'hmac-token', authorization: 'Bearer z', cookie: 'token=a' } },
            },
            'provider call',
        );
        const out = text();
        for (const secret of ['ya29.A', '1//r', 'ya29.B', '1//s', 'eyJ.x.y', 'GOCSPX-1', 'GOCSPX-2', 'enc:v1', 'verifier-1', 'CPDAlvWDx70', 'hmac-token', 'Bearer z']) {
            assert.ok(!out.includes(secret), `${secret} leaked: ${out}`);
        }
        assert.ok(out.includes(LOG_REDACT_CENSOR));
    });

    it('keeps ordinary fields', () => {
        const { log, text } = capture();
        log.info({ provider: 'google', connectionId: 'c-1', status: 401 }, 'refresh failed');
        assert.match(text(), /"provider":"google".*"connectionId":"c-1"/);
    });
});
