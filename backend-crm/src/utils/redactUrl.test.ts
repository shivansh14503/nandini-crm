import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { Writable } from 'node:stream';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { REDACTED_URL_PARAMS, redactQueryObject, redactUrl, serializeRequestForLog } from './redactUrl.js';

describe('redactUrl', () => {
    it('masks every listed parameter', () => {
        for (const name of REDACTED_URL_PARAMS) {
            assert.equal(redactUrl(`/api/x?${name}=s3cr3t&keep=1`), `/api/x?${name}=[REDACTED]&keep=1`, name);
        }
    });

    it('masks an OAuth callback and leaves the rest as it was', () => {
        assert.equal(
            redactUrl('/api/calendar-connections/oauth/google/callback?state=abc&code=4%2F0AQ&scope=email%20openid&hd=nandiniinfosys.com'),
            '/api/calendar-connections/oauth/google/callback?state=[REDACTED]&code=[REDACTED]&scope=email%20openid&hd=nandiniinfosys.com',
        );
    });

    it('matches names case-insensitively and when the name itself is encoded', () => {
        assert.equal(redactUrl('/x?CODE=1&%24deltatoken=abc&%24SkipToken=def'), '/x?CODE=[REDACTED]&%24deltatoken=[REDACTED]&%24SkipToken=[REDACTED]');
        assert.equal(redactUrl('/x?validationtoken=Validation%3A%20Testing'), '/x?validationtoken=[REDACTED]');
    });

    it('masks repeated keys and valueless keys', () => {
        assert.equal(redactUrl('/x?code=a&code=b&state'), '/x?code=[REDACTED]&code=[REDACTED]&state=[REDACTED]');
    });

    it('leaves URLs without a query, and harmless parameters, untouched', () => {
        assert.equal(redactUrl('/api/leads'), '/api/leads');
        assert.equal(redactUrl('/api/leads?page=2&search=code'), '/api/leads?page=2&search=code');
        assert.equal(redactUrl('/api/leads?leadCode=LD-0012&tokens=3'), '/api/leads?leadCode=LD-0012&tokens=3');
        assert.equal(redactUrl(''), '');
        assert.equal(redactUrl(undefined), '');
    });

    it('works on absolute URLs (Graph delta links) and drops a sensitive fragment', () => {
        assert.equal(
            redactUrl('https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=R0usmc&$top=50'),
            'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=[REDACTED]&$top=50',
        );
        assert.equal(redactUrl('https://app/cb?x=1#access_token=abc'), 'https://app/cb?x=1#[REDACTED]');
        assert.equal(redactUrl('https://app/cb?x=1#section'), 'https://app/cb?x=1#section');
    });
});

describe('redactQueryObject', () => {
    it('masks sensitive keys case-insensitively and keeps the rest', () => {
        assert.deepEqual(redactQueryObject({ CODE: 'a', state: ['b', 'c'], $DeltaToken: 'd', page: '2', search: 'code' }), {
            CODE: '[REDACTED]',
            state: '[REDACTED]',
            $DeltaToken: '[REDACTED]',
            page: '2',
            search: 'code',
        });
    });

    it('passes non-objects through', () => {
        assert.equal(redactQueryObject(undefined), undefined);
        assert.equal(redactQueryObject(null), null);
        assert.equal(redactQueryObject('x'), 'x');
    });
});

describe('serializeRequestForLog through pino-http', () => {
    it('keeps OAuth codes, state and validation tokens out of the request log line (url and parsed query)', async () => {
        const lines: string[] = [];
        const sink = new Writable({
            write(chunk, _enc, cb) {
                lines.push(String(chunk));
                cb();
            },
        });
        const app = express();
        app.use(pinoHttp({ logger: pino(sink), serializers: { req: serializeRequestForLog } }));
        app.get('/cb/:provider', (_req, res) => {
            res.json({ ok: true });
        });
        const server = app.listen(0);
        try {
            await new Promise<void>((resolve) => server.once('listening', () => resolve()));
            const { port } = server.address() as AddressInfo;
            const res = await fetch(
                `http://127.0.0.1:${port}/cb/google?code=SECRETCODE&State=STATEVAL&validationToken=VALTOKEN&%24deltatoken=DELTA&page=2`,
            );
            assert.equal(res.status, 200);
            await res.text();
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        const output = lines.join('');
        assert.ok(output.includes('"req"'), 'a request line was logged');
        for (const secret of ['SECRETCODE', 'STATEVAL', 'VALTOKEN', 'DELTA']) {
            assert.ok(!output.includes(secret), `${secret} leaked: ${output}`);
        }
        const logged = JSON.parse(lines.find((line) => line.includes('"req"')) ?? '{}');
        assert.equal(logged.req.query.code, '[REDACTED]');
        assert.equal(logged.req.query.page, '2');
        assert.equal(logged.req.query.State, '[REDACTED]');
        assert.equal(logged.req.url, '/cb/google?code=[REDACTED]&State=[REDACTED]&validationToken=[REDACTED]&%24deltatoken=[REDACTED]&page=2');
    });
});
