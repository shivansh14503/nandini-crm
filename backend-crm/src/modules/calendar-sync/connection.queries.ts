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
}

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
