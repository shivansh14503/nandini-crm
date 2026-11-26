import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { LEASE_EXTEND_MS, LEASE_TTL_MS } from './sync.constants.js';

/**
 * Per-connection lease (Calendar Phase 2 spec §8.4, D12): one push / pull of a calendar at a time, across processes.
 * Prisma `updateMany` (not raw SQL), so the engine's test double covers it; `now` is the app clock.
 */

export type LeaseDb = Pick<PrismaClient, 'calendarConnection'>;

export interface Lease {
    connectionId: string;
    leaseId: string;
    /**
     * Extends the lease when it is due (every LEASE_EXTEND_MS, or sooner when less than `headroomMs` is left); false
     * when the lease was lost (it expired and someone else took it). Cheap to call before every provider call.
     */
    keepAlive(now?: Date, headroomMs?: number): Promise<boolean>;
    release(): Promise<void>;
}

/** Takes the lease of a connection; null when someone else holds an unexpired one. */
export async function claimLease(db: LeaseDb, connectionId: string, now: Date = new Date(), leaseId: string = randomUUID()): Promise<Lease | null> {
    const { count } = await db.calendarConnection.updateMany({
        where: { id: connectionId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        data: { leaseId, leaseUntil: new Date(now.getTime() + LEASE_TTL_MS) },
    });
    if (count !== 1) return null;
    let extendedAt = now.getTime();
    return {
        connectionId,
        leaseId,
        async keepAlive(at: Date = new Date(), headroomMs: number = 0) {
            const left = extendedAt + LEASE_TTL_MS - at.getTime();
            if (at.getTime() - extendedAt < LEASE_EXTEND_MS && left >= headroomMs) return true;
            const { count: kept } = await db.calendarConnection.updateMany({
                where: { id: connectionId, leaseId },
                data: { leaseUntil: new Date(at.getTime() + LEASE_TTL_MS) },
            });
            if (kept === 1) extendedAt = at.getTime();
            return kept === 1;
        },
        async release() {
            await db.calendarConnection.updateMany({ where: { id: connectionId, leaseId }, data: { leaseId: null, leaseUntil: null } });
        },
    };
}
