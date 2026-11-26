import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { Router } from 'express';
import integrationRouter from '../integrations/integration.routes.js';
import connectionRouter from './connection.routes.js';

/** P2-2b removed the per-user OAuth flow: no connect, callback or disconnect route is left behind (addendum §5). */

const routesOf = (router: Router) =>
    (router.stack as unknown as { route?: { path: string; methods: Record<string, boolean> } }[])
        .filter((layer) => layer.route)
        .flatMap((layer) => Object.keys(layer.route!.methods).map((method) => `${method.toUpperCase()} ${layer.route!.path}`))
        .sort();

const SRC = path.resolve(import.meta.dirname, '../..');

describe('removed per-user OAuth routes', () => {
    it('/api/calendar-connections only reads the caller’s own status', () => {
        assert.deepEqual(routesOf(connectionRouter), ['GET /']);
    });

    it('Admin › API Integrations has no connection list or disconnect, and has the People calendar routes', () => {
        const routes = routesOf(integrationRouter);
        assert.ok(!routes.some((r) => r.includes('/connections')), routes.join(', '));
        assert.ok(routes.includes('PUT /people/:username/calendar'));
        assert.ok(routes.includes('POST /people/:username/calendar/check'));
        assert.ok(routes.includes('POST /providers/:provider/test'));
    });

    it('no OAuth module, callback path or state cookie is left in the server', () => {
        assert.ok(!existsSync(path.join(SRC, 'modules/calendar-sync/oauth.ts')));
        assert.ok(!existsSync(path.join(SRC, 'modules/calendar-sync/connectionTokens.ts')));
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'generated') walk(full);
                } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
            }
        };
        walk(SRC);
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            assert.ok(!/oauth\/(google|microsoft)\/callback|\/oauth\/:provider|crm_oauth/.test(text), path.relative(SRC, file));
        }
    });
});
