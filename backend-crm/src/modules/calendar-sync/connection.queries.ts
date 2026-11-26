import { ENV } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';

/**
 * Read-only views of calendar sync rows for Admin › API Integrations (People rows, provider card counts). Prisma only
 * (no adapters), so integrations can import it without a cycle. No cursor or lease column is ever selected.
 */

/** A person's live calendar sync row on the People table. */
export interface PersonConnectionDto {
    id: string;
    provider: string;
    /** pending | ok | error */
    status: string;
    /** error: the user-level code. */
    statusReason: string | null;
    /** domain | override */
    source: string;
    accountEmail: string;
    enrolledAt: string;
    lastSuccessAt: string | null;
    lastCheckedAt: string | null;
    nextCheckAt: string | null;
    /** The admin sentence (+ provider words) of the last problem; null when fine. Admins only. */
    lastErrorMessage: string | null;
    /** The person's webhook channel (P2-7); null while webhooks are off or the row isn't `ok`. */
    webhook: PersonWebhookDto | null;
}

/** `active`: a channel delivers (until `expiresAt`); `failed`: the provider refused the last try; `waiting`: none yet. */
export const PERSON_WEBHOOK_STATUSES = ['active', 'failed', 'waiting'] as const;
export type PersonWebhookStatus = (typeof PERSON_WEBHOOK_STATUSES)[number];

export interface PersonWebhookDto {
    status: PersonWebhookStatus;
    expiresAt: string | null;
}

export type WebhookCounts = { active: number; failed: number; waiting: number };

/** The admin's choice for a person (CalendarSyncUser); null fields = the default. */
export interface PersonCalendarChoiceDto {
    provider: string | null;
    excluded: boolean;
    note: string | null;
    importMeetings: boolean;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** Live calendar rows keyed by lower-cased username. */
export async function liveConnectionsByUsername(): Promise<Map<string, PersonConnectionDto>> {
    const rows = await prisma.calendarConnection.findMany({
        where: { status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: {
            id: true,
            username: true,
            provider: true,
            status: true,
            statusReason: true,
            source: true,
            accountEmail: true,
            enrolledAt: true,
            lastSuccessAt: true,
            lastCheckedAt: true,
            nextCheckAt: true,
            lastErrorMessage: true,
        },
    });
    const webhooks = ENV.INTEGRATIONS.WEBHOOKS_ACTIVE ? await webhookStatusByConnection(rows.filter((r) => r.status === 'ok').map((r) => r.id)) : new Map<string, PersonWebhookDto>();
    return new Map(
        rows.map((row) => [
            row.username.toLowerCase(),
            {
                id: row.id,
                provider: row.provider,
                status: row.status,
                statusReason: row.statusReason,
                source: row.source,
                accountEmail: row.accountEmail,
                enrolledAt: row.enrolledAt.toISOString(),
                lastSuccessAt: iso(row.lastSuccessAt),
                lastCheckedAt: iso(row.lastCheckedAt),
                nextCheckAt: iso(row.nextCheckAt),
                lastErrorMessage: row.status === 'error' ? row.lastErrorMessage : null,
                webhook: webhooks.get(row.id) ?? null,
            },
        ]),
    );
}

/** Admin choices keyed by lower-cased username. */
export async function calendarChoicesByUsername(): Promise<Map<string, PersonCalendarChoiceDto>> {
    const rows = await prisma.calendarSyncUser.findMany({ select: { username: true, provider: true, excluded: true, note: true, importMeetings: true } });
    return new Map(rows.map((row) => [row.username.toLowerCase(), { provider: row.provider, excluded: row.excluded, note: row.note, importMeetings: row.importMeetings }]));
}

export type ConnectionCounts = { ok: number; pending: number; error: number; excluded: number };

/** Which provider an excluded person belongs to (null = none); the caller knows the providers and domains. */
export type ExcludedProviderOf = (person: { email: string | null; provider: string | null }) => string | null;

const IN_CHUNK = 1000;

/**
 * Live rows per provider and status (provider cards), plus the people an admin excluded (CalendarSyncUser.excluded,
 * active and not a group login), each counted once on the provider `providerOf` gives them, whether or not they ever
 * had a row.
 */
export async function connectionCountsByProvider(providerOf: ExcludedProviderOf): Promise<Map<string, ConnectionCounts>> {
    const [rows, exclusions] = await Promise.all([
        prisma.calendarConnection.findMany({ where: { status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { provider: true, status: true } }),
        prisma.calendarSyncUser.findMany({ where: { excluded: true }, select: { username: true, provider: true } }),
    ]);
    const counts = new Map<string, ConnectionCounts>();
    const entry = (provider: string) => {
        const value = counts.get(provider) ?? { ok: 0, pending: 0, error: 0, excluded: 0 };
        counts.set(provider, value);
        return value;
    };
    for (const row of rows) {
        const e = entry(row.provider);
        if (row.status === 'ok') e.ok += 1;
        else if (row.status === 'pending') e.pending += 1;
        else e.error += 1;
    }
    const emailOf = new Map<string, string | null>();
    for (let i = 0; i < exclusions.length; i += IN_CHUNK) {
        const names = exclusions.slice(i, i + IN_CHUNK).map((e) => e.username);
        const people = await prisma.user.findMany({ where: { username: { in: names }, isActive: true, isGroupUser: false }, select: { username: true, email: true } });
        for (const person of people) emailOf.set(person.username.toLowerCase(), person.email);
    }
    for (const exclusion of exclusions) {
        const key = exclusion.username.toLowerCase();
        if (!emailOf.has(key)) continue;
        const provider = providerOf({ email: emailOf.get(key) ?? null, provider: exclusion.provider });
        if (provider) entry(provider).excluded += 1;
    }
    return counts;
}

/**
 * Webhook channel state of `ok` rows (P2-7, Admin › API Integrations): an active channel that hasn't expired (the
 * latest expiry), else a refused last try, else waiting. One read of the active / failed channels (`[connectionId,
 * status]`), only while webhooks are live.
 */
export async function webhookStatusByConnection(connectionIds: readonly string[], now: Date = new Date()): Promise<Map<string, PersonWebhookDto>> {
    const out = new Map<string, PersonWebhookDto>();
    if (connectionIds.length === 0) return out;
    const channels: { connectionId: string; status: string; expiresAt: Date; createdAt: Date }[] = [];
    for (let i = 0; i < connectionIds.length; i += IN_CHUNK) {
        channels.push(
            ...(await prisma.calendarWatchChannel.findMany({
                where: { connectionId: { in: connectionIds.slice(i, i + IN_CHUNK) }, status: { in: ['active', 'failed'] } },
                select: { connectionId: true, status: true, expiresAt: true, createdAt: true },
            })),
        );
    }
    for (const id of connectionIds) {
        const mine = channels.filter((c) => c.connectionId === id);
        const active = mine.filter((c) => c.status === 'active' && c.expiresAt > now).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
        if (active) out.set(id, { status: 'active', expiresAt: active.expiresAt.toISOString() });
        else out.set(id, { status: mine.some((c) => c.status === 'failed') ? 'failed' : 'waiting', expiresAt: null });
    }
    return out;
}

/** Per provider: `ok` rows whose channel is active / refused / not there yet (P2-7 provider cards). */
export async function webhookCountsByProvider(now: Date = new Date()): Promise<Map<string, WebhookCounts>> {
    const rows = await prisma.calendarConnection.findMany({ where: { status: 'ok' }, select: { id: true, provider: true } });
    const statuses = await webhookStatusByConnection(rows.map((r) => r.id), now);
    const counts = new Map<string, WebhookCounts>();
    for (const row of rows) {
        const entry = counts.get(row.provider) ?? { active: 0, failed: 0, waiting: 0 };
        entry[statuses.get(row.id)?.status ?? 'waiting'] += 1;
        counts.set(row.provider, entry);
    }
    return counts;
}
