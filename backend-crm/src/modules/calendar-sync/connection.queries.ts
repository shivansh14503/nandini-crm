import { prisma } from '../../config/prisma.js';
import { LIVE_CONNECTION_STATUSES } from './connection.constants.js';

/**
 * Read-only views of calendar connections for Admin › API Integrations (People rows, provider card counts). Prisma
 * only (no adapters), so integrations can import it without a cycle. No token column is ever selected.
 */

/** A person's live connection on the People table. */
export interface PersonConnectionDto {
    id: string;
    provider: string;
    status: string;
    statusReason: string | null;
    accountEmail: string;
    connectedAt: string;
    /** Google time-limited grant end (`refreshTokenExpiresAt`); null = no known end. */
    accessEndsAt: string | null;
}

const PERSON_SELECT = {
    id: true,
    username: true,
    provider: true,
    status: true,
    statusReason: true,
    accountEmail: true,
    connectedAt: true,
    refreshTokenExpiresAt: true,
} as const;

/** Live calendar connections keyed by lower-cased username. */
export async function liveConnectionsByUsername(): Promise<Map<string, PersonConnectionDto>> {
    const rows = await prisma.calendarConnection.findMany({
        where: { kind: 'calendar', status: { in: [...LIVE_CONNECTION_STATUSES] } },
        select: PERSON_SELECT,
    });
    return new Map(
        rows.map((row) => [
            row.username.toLowerCase(),
            {
                id: row.id,
                provider: row.provider,
                status: row.status,
                statusReason: row.statusReason,
                accountEmail: row.accountEmail,
                connectedAt: row.connectedAt.toISOString(),
                accessEndsAt: row.refreshTokenExpiresAt ? row.refreshTokenExpiresAt.toISOString() : null,
            },
        ]),
    );
}

export type ConnectionCounts = { active: number; reauth: number; error: number };

/** Live connections per provider and status (provider cards). */
export async function connectionCountsByProvider(): Promise<Map<string, ConnectionCounts>> {
    const rows = await prisma.calendarConnection.findMany({ where: { status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { provider: true, status: true } });
    const counts = new Map<string, ConnectionCounts>();
    for (const row of rows) {
        const entry = counts.get(row.provider) ?? { active: 0, reauth: 0, error: 0 };
        if (row.status === 'active') entry.active += 1;
        else if (row.status === 'reauth_required') entry.reauth += 1;
        else entry.error += 1;
        counts.set(row.provider, entry);
    }
    return counts;
}
