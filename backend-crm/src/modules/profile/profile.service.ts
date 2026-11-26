import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import { isRedisReady } from '../../config/redis.js';
import { FIELD_MAX_LENGTH as L } from '../../config/fieldLimits.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthSession, AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { invalidateUserLookupCaches } from '../lookups/lookup.service.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { sessionService } from '../auth/session.service.js';
import {
    joinFullName,
    photoUrlOf,
    PROFILE_SELECT,
    profileAuditSnapshot,
    resolveNameParts,
    toProfileDto,
    toSessionDtos,
    type ProfileDto,
    type SessionsResponse,
} from './profile.dto.js';
import { preparePhoto } from './profile.photo.js';
import type { PhotoUploadInput, ProfileUpdateInput } from './profile.validator.js';

/**
 * My Profile (/api/me): the signed-in user's own details, photo and sessions. Every method acts on the caller only;
 * there is no user id in any request. Admin-managed fields (role, department, email, username) are read-only here.
 */

const ACCOUNT_NOT_FOUND = 'Your account was not found. Please sign in again.';

/** Serializes one user's profile / photo writes (a read-modify-write, and one photo row per user). */
const lockUser = (tx: TransactionClient, userId: number) => acquireLocks(tx, [`user:id:${userId}`]);

const sessionsUnavailable = () =>
    new HttpError('Session list is unavailable right now. Try again in a moment.', StatusCodes.SERVICE_UNAVAILABLE, { code: 'SESSIONS_UNAVAILABLE' });

async function loadProfile(userId: number) {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!row) throw HttpError.unauthorized(ACCOUNT_NOT_FOUND);
    return row;
}

export const profileService = {
    async get(user: AuthUser): Promise<ProfileDto> {
        return toProfileDto(await loadProfile(user.id));
    },

    /**
     * Changes the caller's first / last name, mobile and office phone (keys left out stay as they are; '' / null clears
     * an optional one). When a name changes, `fullName` is rebuilt from the names so every screen that reads it follows;
     * names split from `fullName` (see `resolveNameParts`) count as unchanged, so a phone-only edit keeps `fullName`.
     */
    async update(user: AuthUser, input: ProfileUpdateInput): Promise<ProfileDto> {
        const { row, changed } = await runInTransaction(async (tx) => {
            await lockUser(tx, user.id);
            const before = await tx.user.findUnique({ where: { id: user.id }, select: PROFILE_SELECT });
            if (!before) throw HttpError.unauthorized(ACCOUNT_NOT_FOUND);

            // The names as shown on My Profile: split from `fullName` when the stored parts are missing or stale (a
            // user created or renamed outside the app), so a phone-only edit never needs or rewrites a name.
            const shown = resolveNameParts(before);
            const sameText = (a: string | null | undefined, b: string | null | undefined) => (a?.trim() || null) === (b?.trim() || null);
            const namesChanged =
                (input.firstName !== undefined && !sameText(input.firstName, shown.firstName)) ||
                (input.lastName !== undefined && !sameText(input.lastName, shown.lastName));

            // `fullName` is rebuilt only when a name really changes; otherwise every name column stays as it is.
            let names = { firstName: before.firstName, lastName: before.lastName, fullName: before.fullName };
            if (namesChanged) {
                const firstName = input.firstName !== undefined ? input.firstName : shown.firstName;
                const lastName = input.lastName !== undefined ? input.lastName : shown.lastName;
                // A row with no name at all: a first name is needed before the name can be built from its parts.
                if (!firstName?.trim()) {
                    const message = 'First Name is required.';
                    throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['firstName'] }] });
                }
                const fullName = joinFullName(firstName, lastName);
                if (fullName.length > L.personName) {
                    const message = `First and last name together cannot exceed ${L.personName - 1} characters.`;
                    throw new HttpError(message, StatusCodes.BAD_REQUEST, {
                        code: 'VALIDATION_ERROR',
                        errors: [{ message, path: [input.lastName !== undefined ? 'lastName' : 'firstName'] }],
                    });
                }
                names = { firstName, lastName, fullName };
            }
            const next = {
                ...names,
                phone: input.mobile !== undefined ? input.mobile : before.phone,
                officePhone: input.officePhone !== undefined ? input.officePhone : before.officePhone,
            };

            const changes = diffRecords(profileAuditSnapshot(before), profileAuditSnapshot(next));
            if (Object.keys(changes).length === 0) return { row: before, changed: false };

            const after = await tx.user.update({ where: { id: user.id }, data: next, select: PROFILE_SELECT });
            await auditService.record(tx, { entityType: 'User', entityId: String(user.id), action: 'UPDATE', changedBy: user.username, changes });
            return { row: after, changed: true };
        });
        if (changed) await invalidateUserLookupCaches();
        return toProfileDto(row);
    },

    /** Replaces the caller's photo with a new row (new id → new URL, so caches never show the old one). */
    async setPhoto(user: AuthUser, input: PhotoUploadInput): Promise<{ photoUrl: string }> {
        const { data, mimeType } = preparePhoto(input);
        const photoId = await runInTransaction(async (tx) => {
            await lockUser(tx, user.id);
            const old = await tx.userPhoto.findUnique({ where: { userId: user.id }, select: { id: true } });
            if (old) await tx.userPhoto.delete({ where: { id: old.id } });
            const created = await tx.userPhoto.create({
                data: { userId: user.id, mimeType, sizeBytes: data.length, data: new Uint8Array(data) },
                select: { id: true },
            });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(user.id),
                action: 'UPDATE',
                changedBy: user.username,
                changes: { photo: { from: old?.id ?? null, to: created.id } },
            });
            return created.id;
        });
        await invalidateUserLookupCaches();
        return { photoUrl: photoUrlOf(photoId)! };
    },

    /** Removes the caller's photo (nothing to do, and no audit entry, when there is none). */
    async removePhoto(user: AuthUser): Promise<{ photoUrl: null }> {
        const removed = await runInTransaction(async (tx) => {
            await lockUser(tx, user.id);
            const old = await tx.userPhoto.findUnique({ where: { userId: user.id }, select: { id: true } });
            if (!old) return false;
            await tx.userPhoto.delete({ where: { id: old.id } });
            await auditService.record(tx, {
                entityType: 'User',
                entityId: String(user.id),
                action: 'UPDATE',
                changedBy: user.username,
                changes: { photo: { from: old.id, to: null } },
            });
            return true;
        });
        if (removed) await invalidateUserLookupCaches();
        return { photoUrl: null };
    },

    /** GET /api/user-photos/:id — any signed-in user may see any user's photo (it is shown next to their name). */
    async photo(id: string): Promise<{ data: Buffer; mimeType: string }> {
        const row = await prisma.userPhoto.findUnique({ where: { id }, select: { data: true, mimeType: true } });
        if (!row) throw HttpError.notFound('Photo not found');
        return { data: Buffer.from(row.data), mimeType: row.mimeType };
    },

    /**
     * The caller's signed-in sessions, current first. Empty with `tracked: false` when Redis is down (sessions can't be
     * read); `tracked: false` with a list when this request's own session was opened while Redis was down.
     */
    async sessions(user: AuthUser, session: AuthSession): Promise<SessionsResponse> {
        const records = isRedisReady() ? await sessionService.list(user.id) : null;
        if (!records) return { tracked: false, sessions: [] };
        return { tracked: session.tracked, sessions: toSessionDtos(records, session.jti) };
    },

    /** Signs out one other session of the caller. 400 CURRENT_SESSION for the request's own, 404 when there is none. */
    async revokeSession(user: AuthUser, session: AuthSession, sessionId: string): Promise<void> {
        if (sessionId === session.jti) {
            throw new HttpError('Use Sign out to end this session.', StatusCodes.BAD_REQUEST, { code: 'CURRENT_SESSION' });
        }
        const revoked = await sessionService.revokeOne(user.id, sessionId);
        if (revoked === null) throw sessionsUnavailable();
        if (!revoked) throw HttpError.notFound('This session has already ended.');
        void auditService.enqueue({
            entityType: 'User',
            entityId: String(user.id),
            action: 'SESSION_REVOKE',
            changedBy: user.username,
            changes: { sessionId, scope: 'one' },
        });
    },

    /**
     * Signs out every other session of the caller, keeping this one. 503 SESSIONS_UNAVAILABLE (and no audit entry) when
     * Redis can't be asked or fails partway, as for a single session: the user must not be told it worked.
     */
    async revokeOtherSessions(user: AuthUser, session: AuthSession): Promise<{ signedOutSessions: number }> {
        const signedOutSessions = await sessionService.revokeAllExcept(user.id, session.jti);
        if (signedOutSessions === null) throw sessionsUnavailable();
        void auditService.enqueue({
            entityType: 'User',
            entityId: String(user.id),
            action: 'SESSION_REVOKE',
            changedBy: user.username,
            changes: { scope: 'others', signedOutSessions },
        });
        return { signedOutSessions };
    },
};
