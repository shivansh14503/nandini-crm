import { randomBytes } from 'node:crypto';
import { fakeProviderState } from './fake.js';
import { ProviderAuthError, type ProviderError } from './http.js';
import type { CalendarProviderAdapter, CallCtx, WatchCreated } from './types.js';

/**
 * Webhook channels of the in-memory `fake` provider (P2-7): tests (and local development with CALENDAR_FAKE_PROVIDER)
 * create, renew, stop and look up channels without Google or Microsoft. Each channel is kept by its external id
 * (`fake-res-…`) with the address and token it was created with, so a test can play the provider calling the webhook
 * route. `gone` makes a channel unknown to the provider (renew → recreate, exists → false); `failNext` fails the next
 * call of an operation once. Kept in its own module so fake.ts (the event calendar) stays as it is.
 */

export type FakeWatchOp = 'watch' | 'renew' | 'stop' | 'exists';

export interface FakeChannel {
    channelId: string;
    externalId: string;
    mailbox: string;
    address: string;
    lifecycleAddress?: string;
    token: string;
    expiresAt: Date;
    stopped: boolean;
}

export interface FakeWatchState {
    channels: Map<string, FakeChannel>;
    calls: { op: FakeWatchOp; mailbox: string; channelId?: string; externalId?: string }[];
    failNext: Partial<Record<FakeWatchOp, ProviderError>>;
    /** External ids the provider no longer knows. */
    gone: Set<string>;
}

export const fakeWatchState: FakeWatchState = { channels: new Map(), calls: [], failNext: {}, gone: new Set() };

export function resetFakeWatch(): void {
    fakeWatchState.channels.clear();
    fakeWatchState.calls = [];
    fakeWatchState.failNext = {};
    fakeWatchState.gone.clear();
}

/** 401 unless the token is a live one of this mailbox (the fake's token check). */
function checkToken(ctx: CallCtx, operation: string): void {
    if (fakeProviderState.tokens.get(ctx.accessToken) !== ctx.mailbox.toLowerCase()) {
        throw new ProviderAuthError({ provider: 'fake', operation, status: 401, code: 'http_401' });
    }
}

function begin(ctx: CallCtx, op: FakeWatchOp, ids: { channelId?: string; externalId?: string } = {}): void {
    fakeWatchState.calls.push({ op, mailbox: ctx.mailbox.toLowerCase(), ...ids });
    checkToken(ctx, `watch-${op}`);
    const error = fakeWatchState.failNext[op];
    if (error) {
        delete fakeWatchState.failNext[op];
        throw error;
    }
}

export function fakeWatchOps(now: () => Date = () => new Date()): Pick<CalendarProviderAdapter, 'watch' | 'renewWatch' | 'stopWatch' | 'watchExists'> {
    const known = (externalId: string) => {
        const channel = fakeWatchState.channels.get(externalId);
        return channel && !channel.stopped && !fakeWatchState.gone.has(externalId) && channel.expiresAt > now() ? channel : null;
    };
    return {
        async watch(ctx, request): Promise<WatchCreated> {
            begin(ctx, 'watch', { channelId: request.channelId });
            const externalId = `fake-res-${randomBytes(9).toString('base64url')}`;
            const channel: FakeChannel = {
                channelId: request.channelId,
                externalId,
                mailbox: ctx.mailbox.toLowerCase(),
                address: request.address,
                ...(request.lifecycleAddress ? { lifecycleAddress: request.lifecycleAddress } : {}),
                token: request.token,
                expiresAt: request.expiresAt,
                stopped: false,
            };
            fakeWatchState.channels.set(externalId, channel);
            return { externalId, expiresAt: request.expiresAt };
        },
        async renewWatch(ctx, ref, expiresAt) {
            begin(ctx, 'renew', ref);
            const channel = known(ref.externalId);
            if (!channel) return 'recreate';
            channel.expiresAt = expiresAt;
            return { expiresAt };
        },
        async stopWatch(ctx, ref) {
            begin(ctx, 'stop', ref);
            const channel = fakeWatchState.channels.get(ref.externalId);
            if (channel) channel.stopped = true;
        },
        async watchExists(ctx, ref) {
            begin(ctx, 'exists', ref);
            return known(ref.externalId) !== null;
        },
    };
}
