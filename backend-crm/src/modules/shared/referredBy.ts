import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { ACTIVE_REFERRAL_STATUS } from '../referrals/referral.validator.js';

/**
 * Referred By of a lead or opportunity (shown, and required, for Lead Source CA / Reference; see leadSource.ts) is a
 * Referral: `referredById` links it and `referredBy` keeps the referral's name, written through when the referral is
 * renamed (nameSync.ts). The form picks it from the active referrals.
 *
 * Values typed before the Referrals module existed have no link. They are kept as they are (migration
 * 20261125220000_referrals) and an edit keeps such a value while it is sent unchanged; any other value must name an
 * Active referral. A referral that later went Inactive or was deleted also stays on the records that already have it.
 */
export interface ReferredByValue {
    referredBy?: string | null;
    referredById?: string | null;
}

export interface ResolvedReferredBy {
    referredBy: string | null;
    referredById: string | null;
}

interface ReferralRef {
    id: string;
    name: string;
    status: string;
    isDeleted: boolean;
}

const NOT_A_REFERRAL = 'Pick Referred By from the active Referrals.';

const trimmed = (value: string | null | undefined) => value?.trim() ?? '';

/** What a lead / opportunity keeps from what was sent (`next`) and what it held (`previous`), given the referrals found. */
export function decideReferredBy(
    next: ReferredByValue,
    previous: ReferredByValue | undefined,
    found: { byId?: ReferralRef | null; byName?: ReferralRef[] },
): ResolvedReferredBy | { error: string } {
    const name = trimmed(next.referredBy);
    const id = trimmed(next.referredById);
    if (!name && !id) return { referredBy: null, referredById: null };

    if (id) {
        const keeping = trimmed(previous?.referredById) === id;
        const referral = found.byId;
        if (referral && !referral.isDeleted && (keeping || referral.status === ACTIVE_REFERRAL_STATUS)) {
            return { referredBy: referral.name, referredById: referral.id };
        }
        // The referral it already had went away: the record keeps the name it showed.
        if (keeping) return { referredBy: trimmed(previous?.referredBy) || name || null, referredById: id };
        return { error: referral && !referral.isDeleted ? 'This referral is Inactive. Pick an active referral.' : 'The selected referral no longer exists.' };
    }

    // Unchanged text: a legacy (unlinked) value, or the linked referral's name sent without its id.
    if (previous && trimmed(previous.referredBy).toLowerCase() === name.toLowerCase()) {
        return { referredBy: trimmed(previous.referredBy), referredById: trimmed(previous.referredById) || null };
    }
    const matches = (found.byName ?? []).filter((r) => !r.isDeleted && r.status === ACTIVE_REFERRAL_STATUS);
    if (matches.length === 1) return { referredBy: matches[0].name, referredById: matches[0].id };
    if (matches.length > 1) return { error: `Several active referrals are named "${name}". Pick one from the Referrals list.` };
    return { error: NOT_A_REFERRAL };
}

/**
 * Resolves Referred By against the referrals (inside the write transaction) and returns what to store. Throws 400 on
 * `path` (default `referredBy`) when the value isn't an active referral.
 */
export async function resolveReferredBy(
    tx: TransactionClient,
    next: ReferredByValue,
    previous?: ReferredByValue,
    path = 'referredBy',
): Promise<ResolvedReferredBy> {
    const name = trimmed(next.referredBy);
    const id = trimmed(next.referredById);
    const select = { id: true, name: true, status: true, isDeleted: true } as const;
    const found = id
        ? { byId: await tx.referral.findUnique({ where: { id }, select }) }
        : name
          ? // SQL Server's default collation compares case-insensitively.
            { byName: await tx.referral.findMany({ where: { name, isDeleted: false, status: ACTIVE_REFERRAL_STATUS }, select, take: 2 }) }
          : {};
    const decided = decideReferredBy(next, previous, found);
    if ('error' in decided) throw HttpError.badRequest(decided.error, [{ message: decided.error, path: [path] }]);
    return decided;
}

/** The fields whose change re-resolves Referred By on an edit. */
export const REFERRED_BY_KEYS = ['referredBy', 'referredById'] as const;
