import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { GOOGLE_CALENDAR_API, GRAPH_API } from '../../integrations/integration.constants.js';
import { fakeFetch, route } from '../testing/fakeFetch.js';
import { createGoogleAdapter } from './google.js';
import { GOOGLE_WATCH_TTL_SECONDS, googleExpiration, googleWatchBody } from './googleWatch.js';
import { GRAPH_SUBSCRIPTION_MAX_MINUTES, graphSubscriptionBody } from './graphWatch.js';
import { ProviderBadRequestError, ProviderTransientError, resetProviderPauses } from './http.js';
import { createMicrosoftAdapter } from './microsoft.js';
import type { CallCtx } from './types.js';

/**
 * Webhook channel calls (Calendar Phase 2 spec §7.4, §7.5, §3.4; P2-7) against hand-written answers in the providers'
 * documented shapes (no network): Google `events.watch` / `channels.stop`, Graph `POST/PATCH/DELETE/GET /subscriptions`.
 */

const ctx = (over: Partial<CallCtx> = {}): CallCtx => ({ accessToken: 'tok', calendarId: 'primary', accountEmail: 'asha@nandiniinfosys.com', mailbox: 'asha@nandiniinfosys.com', ...over });
const NOW = new Date('2026-11-26T06:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 24 * 3_600_000);
const CHANNEL = 'wabcdef12-11111111-2222-4333-8444-555555555555';

beforeEach(() => resetProviderPauses());

describe('Google push channels', () => {
    it('watch posts the documented body on primary as the person and keeps Google’s resourceId and expiration', async () => {
        const expiration = String(inDays(6).getTime());
        const { fetchImpl, calls } = fakeFetch([
            route(`${GOOGLE_CALENDAR_API}/calendars/primary/events/watch`, () => ({ status: 200, body: { kind: 'api#channel', id: CHANNEL, resourceId: 'res-1', resourceUri: 'x', expiration } }), 'POST'),
        ]);
        const adapter = createGoogleAdapter({ fetchImpl });
        const created = await adapter.watch!(ctx(), { channelId: CHANNEL, address: 'https://crm.example.com/api/webhooks/google/calendar', token: 'hmac-token', expiresAt: inDays(7) });
        assert.equal(created.externalId, 'res-1');
        assert.equal(created.expiresAt.getTime(), Number(expiration), 'Google’s (shorter) expiration is the stored one');
        assert.equal(calls[0].headers.authorization, 'Bearer tok');
        const body = calls[0].json as Record<string, unknown>;
        assert.equal(body.id, CHANNEL);
        assert.equal(body.type, 'web_hook');
        assert.equal(body.address, 'https://crm.example.com/api/webhooks/google/calendar');
        assert.equal(body.token, 'hmac-token');
        assert.ok(Number((body.params as { ttl: string }).ttl) <= GOOGLE_WATCH_TTL_SECONDS);
    });

    it('the ttl is the asked life, at most 7 days; a missing expiration falls back to the asked one', () => {
        assert.deepEqual(googleWatchBody({ channelId: 'c', address: 'a', token: 't', expiresAt: inDays(30) }, NOW).params, { ttl: String(GOOGLE_WATCH_TTL_SECONDS) });
        assert.deepEqual(googleWatchBody({ channelId: 'c', address: 'a', token: 't', expiresAt: inDays(1) }, NOW).params, { ttl: String(24 * 3600) });
        assert.equal(googleExpiration(undefined, inDays(7)).getTime(), inDays(7).getTime());
        assert.equal(googleExpiration('junk', inDays(7)).getTime(), inDays(7).getTime());
    });

    it('stop posts id + resourceId to channels/stop; a channel Google no longer knows counts as stopped', async () => {
        const { fetchImpl, calls } = fakeFetch([route(`${GOOGLE_CALENDAR_API}/channels/stop`, (call) => ((call.json as { id: string }).id === 'gone' ? { status: 404, body: { error: { code: 404, errors: [{ reason: 'notFound' }] } } } : { status: 204 }), 'POST')]);
        const adapter = createGoogleAdapter({ fetchImpl });
        await adapter.stopWatch!(ctx(), { channelId: CHANNEL, externalId: 'res-1' });
        assert.deepEqual(calls[0].json, { id: CHANNEL, resourceId: 'res-1' });
        await adapter.stopWatch!(ctx(), { channelId: 'gone', externalId: 'res-2' });
        assert.equal(adapter.renewWatch, undefined, 'Google has no renew call');
    });

    it('a refused watch (e.g. an address Google won’t call) is a ProviderBadRequestError', async () => {
        const { fetchImpl } = fakeFetch([route(`${GOOGLE_CALENDAR_API}/calendars/primary/events/watch`, () => ({ status: 400, body: { error: { code: 400, message: 'WebHook callback must be HTTPS', errors: [{ reason: 'push.webhookUrlNotHttps' }] } } }))]);
        await assert.rejects(createGoogleAdapter({ fetchImpl }).watch!(ctx(), { channelId: CHANNEL, address: 'http://x', token: 't', expiresAt: inDays(7) }), ProviderBadRequestError);
    });
});

describe('Microsoft Graph subscriptions', () => {
    const mailbox = 'ravi@nandiniinfosys.com';

    it('subscribe posts users/{mailbox}/events with both URLs, clientState and an expiry inside Graph’s 10,080 minutes', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GRAPH_API}/subscriptions`, () => ({ status: 201, body: { id: 'sub-1', expirationDateTime: inDays(6).toISOString(), resource: `users/${mailbox}/events` } }), 'POST'),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        const created = await adapter.watch!(ctx({ mailbox, accountEmail: mailbox, calendarId: '' }), {
            channelId: CHANNEL,
            address: 'https://crm.example.com/api/webhooks/microsoft/calendar',
            lifecycleAddress: 'https://crm.example.com/api/webhooks/microsoft/lifecycle',
            token: 'client-state',
            expiresAt: inDays(30),
        });
        assert.equal(created.externalId, 'sub-1');
        const body = calls[0].json as Record<string, string>;
        assert.equal(body.changeType, 'created,updated,deleted');
        assert.equal(body.resource, `users/${mailbox}/events`);
        assert.equal(body.notificationUrl, 'https://crm.example.com/api/webhooks/microsoft/calendar');
        assert.equal(body.lifecycleNotificationUrl, 'https://crm.example.com/api/webhooks/microsoft/lifecycle');
        assert.equal(body.clientState, 'client-state');
        assert.ok(Date.parse(body.expirationDateTime) - Date.now() <= GRAPH_SUBSCRIPTION_MAX_MINUTES * 60_000, 'never past the documented maximum');
    });

    it('the body builder caps the expiry and leaves the lifecycle URL out when there is none', () => {
        const body = graphSubscriptionBody({ address: 'https://a', token: 't', expiresAt: inDays(30) }, mailbox, NOW);
        assert.equal(body.lifecycleNotificationUrl, undefined);
        assert.ok(Date.parse(String(body.expirationDateTime)) <= NOW.getTime() + GRAPH_SUBSCRIPTION_MAX_MINUTES * 60_000);
    });

    it('renew PATCHes the expiry; 404 → recreate', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GRAPH_API}/subscriptions/sub-1`, (call) => ({ status: 200, body: { id: 'sub-1', expirationDateTime: (call.json as { expirationDateTime: string }).expirationDateTime } }), 'PATCH'),
            route(`${GRAPH_API}/subscriptions/sub-gone`, () => ({ status: 404, body: { error: { code: 'ResourceNotFound', message: 'gone' } } }), 'PATCH'),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        const renewed = await adapter.renewWatch!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-1' }, inDays(6));
        assert.notEqual(renewed, 'recreate');
        assert.deepEqual(Object.keys(calls[0].json as object), ['expirationDateTime']);
        assert.equal(await adapter.renewWatch!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-gone' }, inDays(6)), 'recreate');
    });

    it('stop DELETEs (404 is fine); exists GETs (404 → false; a 5xx is not “gone”)', async () => {
        const { fetchImpl, calls } = fakeFetch([
            route(`${GRAPH_API}/subscriptions/sub-1`, () => ({ status: 204 }), 'DELETE'),
            route(`${GRAPH_API}/subscriptions/sub-gone`, () => ({ status: 404, body: { error: { code: 'ResourceNotFound' } } }), 'DELETE'),
            route(`${GRAPH_API}/subscriptions/sub-1`, () => ({ status: 200, body: { id: 'sub-1' } }), 'GET'),
            route(`${GRAPH_API}/subscriptions/sub-gone`, () => ({ status: 404, body: { error: { code: 'ResourceNotFound' } } }), 'GET'),
            route(`${GRAPH_API}/subscriptions/sub-down`, () => ({ status: 503, body: {} }), 'GET'),
        ]);
        const adapter = createMicrosoftAdapter({ fetchImpl });
        await adapter.stopWatch!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-1' });
        await adapter.stopWatch!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-gone' });
        assert.equal(calls[0].method, 'DELETE');
        assert.equal(await adapter.watchExists!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-1' }), true);
        assert.equal(await adapter.watchExists!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-gone' }), false);
        await assert.rejects(adapter.watchExists!(ctx({ mailbox }), { channelId: CHANNEL, externalId: 'sub-down' }), ProviderTransientError);
    });
});
