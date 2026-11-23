import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { auditContextMiddleware, currentAuditOrigin, normalizeIp, normalizePage, REQUEST_ID_HEADER, runWithAuditOrigin } from './auditContext.js';

describe('normalizeIp', () => {
    it('unwraps IPv4-mapped IPv6 addresses', () => {
        assert.equal(normalizeIp('::ffff:10.0.0.5'), '10.0.0.5');
        assert.equal(normalizeIp('::1'), '::1');
        assert.equal(normalizeIp(undefined), undefined);
    });
});

describe('normalizePage', () => {
    it('keeps same-site paths only, without query string or hash', () => {
        assert.equal(normalizePage('/leads/123?tab=notes#x'), '/leads/123');
        assert.equal(normalizePage('https://evil.example/x'), undefined);
        assert.equal(normalizePage('//evil.example/x'), undefined);
        assert.equal(normalizePage(42), undefined);
        assert.equal(normalizePage(`/${'a'.repeat(400)}`)!.length, 300);
    });
});

function fakeRequest(headers: Record<string, string>, extra: Partial<Request> = {}): Request {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        method: 'PATCH',
        ip: '::ffff:192.168.1.20',
        baseUrl: '/api/leads',
        originalUrl: '/api/leads/abc?x=1',
        get: (name: string) => lower[name.toLowerCase()],
        ...extra,
    } as unknown as Request;
}

describe('auditContextMiddleware', () => {
    it('tags the request with an id and resolves user, route and client lazily', async () => {
        const req = fakeRequest({ 'X-CRM-Client': 'web', 'X-CRM-Page': '/leads/abc', 'User-Agent': 'Mozilla/5.0' });
        const headers: Record<string, string> = {};
        const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;

        const seen = await new Promise<ReturnType<typeof currentAuditOrigin>[]>((resolve) => {
            const next: NextFunction = async () => {
                const before = currentAuditOrigin();
                // Later middleware signs the user in and the router matches the route.
                Object.assign(req, { user: { id: 7, username: 'asha', role: 'Sales Manager' }, auth: { jti: 'sess-1', tracked: true }, route: { path: '/:id' } });
                await new Promise((r) => setTimeout(r, 1));
                resolve([before, currentAuditOrigin()]);
            };
            auditContextMiddleware(req, res, next);
        });

        const [before, after] = seen;
        assert.equal(headers[REQUEST_ID_HEADER], before!.requestId);
        assert.equal((req as Request & { id?: string }).id, before!.requestId);
        assert.equal(before!.source, 'UI');
        assert.equal(before!.actorId, undefined);
        assert.equal(before!.route, '/api/leads/abc');
        assert.deepEqual(
            { ...after, requestId: undefined },
            {
                requestId: undefined,
                source: 'UI',
                httpMethod: 'PATCH',
                page: '/leads/abc',
                userAgent: 'Mozilla/5.0',
                actorId: 7,
                actorRole: 'Sales Manager',
                sessionId: 'sess-1',
                route: '/api/leads/:id',
                ipAddress: '192.168.1.20',
            },
        );
    });

    it('marks requests from other clients as API', async () => {
        const req = fakeRequest({});
        const res = { setHeader: () => undefined } as unknown as Response;
        const origin = await new Promise<ReturnType<typeof currentAuditOrigin>>((resolve) => auditContextMiddleware(req, res, () => resolve(currentAuditOrigin())));
        assert.equal(origin!.source, 'API');
    });
});

describe('runWithAuditOrigin', () => {
    it('gives a job run one origin across awaits, and nothing outside it', async () => {
        assert.equal(currentAuditOrigin(), undefined);
        const ids = await runWithAuditOrigin({ source: 'JOB', route: 'job:test' }, async () => {
            const first = currentAuditOrigin();
            await new Promise((r) => setTimeout(r, 1));
            const second = currentAuditOrigin();
            assert.equal(first!.source, 'JOB');
            assert.equal(second!.route, 'job:test');
            return [first!.requestId, second!.requestId];
        });
        assert.equal(ids[0], ids[1]);
        assert.ok(ids[0]);
        assert.equal(currentAuditOrigin(), undefined);
    });

    it('keeps a given request id (an import id)', () => {
        const id = runWithAuditOrigin({ source: 'IMPORT', requestId: 'import-1' }, () => currentAuditOrigin()!.requestId);
        assert.equal(id, 'import-1');
    });
});
