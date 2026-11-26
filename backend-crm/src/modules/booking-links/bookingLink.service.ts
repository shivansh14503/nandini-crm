import { randomInt } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { ENV } from '../../config/env.js';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { BookingLink } from '../../generated/prisma/client.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { RELATED_LOADERS } from '../activities/activity.links.js';
import { NOTE_TYPE, TASK_TYPE, type ActivityRelatedModule } from '../activities/activity.schedule.js';
import { LIVE_CONNECTION_STATUSES } from '../calendar-sync/connection.constants.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { canAccessRecord } from '../shared/accessControl.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { bookingAccessOf, isBookingAdmin, roleMayOwnLinks, type BookingAccess } from './bookingLink.access.js';
import { BOOKING_DEFAULTS, BOOKING_ERROR_CODES, BOOKING_MAX_LINKS_PER_OWNER, BOOKING_WEEKDAYS, type BookingSlotStep } from './bookingLink.constants.js';
import { BOOKING_SETTING_KEY, bookingSettingsPatchSchema, bookingSettingsSchema, readBookingSettings, type BookingSettings } from './bookingLink.settings.js';
import type { SlotRules, WeeklyAvailability } from './bookingLink.slots.js';
import { availabilitySchema, createLinkSchema, linkListQuerySchema, updateLinkSchema, type UpdateLinkInput } from './bookingLink.validator.js';

/**
 * Booking links, the signed-in side (`/api/booking-links`): an employee's own links (or, for admins, anyone's), the
 * company settings, and the link loader the public page shares (bookingLink.public.ts).
 *
 * Who: the company switch must be on to create or change a link (turning one off always works); a user creates links
 * for themselves when `whoCanCreate` allows their role; admins see everyone's and create / change one for any active,
 * non-group colleague. Anyone else asking about a link gets 404 (no hint that it exists).
 * Writes are audited (`BookingLink` CREATE / UPDATE) and drop the public page's cached copy of the link.
 */

// ── Settings ─────────────────────────────────────────────────────────────────

export async function loadBookingSettings(): Promise<BookingSettings> {
    const configs = await formConfigService.getAllConfigs();
    return readBookingSettings(configs.moduleSettings.activities?.[BOOKING_SETTING_KEY]);
}

async function saveBookingSettings(patch: unknown, user: AuthUser): Promise<BookingSettings> {
    const changes = bookingSettingsPatchSchema.parse(patch);
    const merged = bookingSettingsSchema.parse({ ...(await loadBookingSettings()), ...changes });
    await formConfigService.updateModuleSetting('activities', BOOKING_SETTING_KEY, { value: merged }, user);
    // The public page caches links with the switch's effect (60 s): drop them so "off" is immediate.
    await cacheService.invalidatePattern(`${LINK_CACHE_PREFIX}*`);
    return merged;
}

// ── Stored link → config ─────────────────────────────────────────────────────

/** What the services use of a stored link (JSON columns parsed; an unreadable value reads as "no hours"). */
export interface LinkConfig {
    id: string;
    slug: string;
    ownerUsername: string;
    title: string;
    followupType: string;
    durations: number[];
    location: string | null;
    note: string | null;
    reminder: string | null;
    askPhone: boolean;
    askCompany: boolean;
    relatedModule: ActivityRelatedModule | null;
    relatedId: string | null;
    isActive: boolean;
    rules: SlotRules;
    updatedAt: Date;
    createdAt: Date;
    createdBy: string;
}

export function parseDurations(json: string): number[] {
    try {
        const value = JSON.parse(json) as unknown;
        if (Array.isArray(value)) {
            const list = value.filter((m): m is number => Number.isInteger(m) && m > 0 && m <= 24 * 60);
            if (list.length) return list;
        }
    } catch {
        // fall through
    }
    return [...BOOKING_DEFAULTS.durations];
}

export function parseAvailability(json: string): WeeklyAvailability {
    try {
        const parsed = availabilitySchema.safeParse(JSON.parse(json));
        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
}

export function toLinkConfig(row: BookingLink): LinkConfig {
    return {
        id: row.id,
        slug: row.slug,
        ownerUsername: row.ownerUsername,
        title: row.title,
        followupType: row.followupType,
        durations: parseDurations(row.durationsJson),
        location: row.location,
        note: row.note,
        reminder: row.reminder,
        askPhone: row.askPhone,
        askCompany: row.askCompany,
        relatedModule: (row.relatedModule as ActivityRelatedModule | null) ?? null,
        relatedId: row.relatedId,
        isActive: row.isActive,
        rules: {
            slotStepMinutes: row.slotStepMinutes,
            availability: parseAvailability(row.availabilityJson),
            bufferBeforeMinutes: row.bufferBeforeMinutes,
            bufferAfterMinutes: row.bufferAfterMinutes,
            minNoticeMinutes: row.minNoticeMinutes,
            horizonDays: row.horizonDays,
            maxPerDay: row.maxPerDay,
        },
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
    };
}

// ── Public-page link cache ───────────────────────────────────────────────────

const LINK_CACHE_PREFIX = 'cache:booking-link:';
/** Short: the owner's active flag rides along and Admin › Users doesn't know about this cache. */
const LINK_CACHE_SECONDS = 60;

/** A live link as the public page needs it, with its owner's display name; null = 404 (any reason). */
export interface PublicLink {
    link: LinkConfig;
    ownerName: string;
}

type CachedLink = { row: Record<string, unknown>; ownerName: string } | null;

const revive = (row: Record<string, unknown>): BookingLink =>
    ({ ...row, createdAt: new Date(row.createdAt as string), updatedAt: new Date(row.updatedAt as string) }) as BookingLink;

/**
 * The active link of `slug` whose owner is an active, non-group user, or null. Cached 60 s per slug (a miss too, so
 * random slugs don't reach the database each time); every link write drops its slug's entry. The company switch is
 * checked by the caller (settings come from the form-config cache).
 */
export async function findPublicLink(slug: string): Promise<PublicLink | null> {
    const cached = await cacheService.getOrSetGuarded<CachedLink>(`${LINK_CACHE_PREFIX}${slug}`, LINK_CACHE_SECONDS, async () => {
        const row = await prisma.bookingLink.findUnique({ where: { slug } });
        if (!row || !row.isActive) return null;
        const owner = await prisma.user.findUnique({ where: { username: row.ownerUsername }, select: { fullName: true, username: true, isActive: true, isGroupUser: true } });
        if (!owner || !owner.isActive || owner.isGroupUser) return null;
        return { row: row as unknown as Record<string, unknown>, ownerName: (owner.fullName || '').trim() || owner.username };
    });
    return cached ? { link: toLinkConfig(revive(cached.row)), ownerName: cached.ownerName } : null;
}

const dropLinkCache = (...slugs: string[]) => cacheService.invalidate(...slugs.map((slug) => `${LINK_CACHE_PREFIX}${slug}`));

// ── DTO ──────────────────────────────────────────────────────────────────────

/** Whether visitors can be offered times from the owner's company calendar. */
export type OwnerCalendarStatus = 'synced' | 'not_connected' | 'error';

export interface BookingLinkDto {
    id: string;
    slug: string;
    /** App path of the public page (`/book/<slug>`); the frontend adds its own origin. */
    path: string;
    ownerUsername: string;
    ownerName: string;
    title: string;
    followupType: string;
    durations: number[];
    slotStepMinutes: number;
    location: string;
    note: string;
    availability: WeeklyAvailability;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    horizonDays: number;
    maxPerDay: number | null;
    reminder: string | null;
    askPhone: boolean;
    askCompany: boolean;
    relatedModule: ActivityRelatedModule | null;
    relatedId: string | null;
    /** The related record's code and label ('' when none or it was deleted). */
    relatedCode: string;
    relatedLabel: string;
    isActive: boolean;
    bookings: { total: number; upcoming: number; lastBookedAt: string | null };
    ownerCalendar: OwnerCalendarStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

interface DtoExtras {
    ownerName: string;
    stats?: { total: number; upcoming: number; lastBookedAt: Date | null };
    related?: { code: string; label: string } | null;
    ownerCalendar: OwnerCalendarStatus;
}

export function toBookingLinkDto(row: BookingLink, extras: DtoExtras): BookingLinkDto {
    const link = toLinkConfig(row);
    return {
        id: row.id,
        slug: row.slug,
        path: `/book/${row.slug}`,
        ownerUsername: row.ownerUsername,
        ownerName: extras.ownerName,
        title: row.title,
        followupType: row.followupType,
        durations: link.durations,
        slotStepMinutes: row.slotStepMinutes,
        location: row.location ?? '',
        note: row.note ?? '',
        availability: link.rules.availability,
        bufferBeforeMinutes: row.bufferBeforeMinutes,
        bufferAfterMinutes: row.bufferAfterMinutes,
        minNoticeMinutes: row.minNoticeMinutes,
        horizonDays: row.horizonDays,
        maxPerDay: row.maxPerDay,
        reminder: row.reminder,
        askPhone: row.askPhone,
        askCompany: row.askCompany,
        relatedModule: link.relatedModule,
        relatedId: row.relatedId,
        relatedCode: extras.related?.code ?? '',
        relatedLabel: extras.related?.label ?? '',
        isActive: row.isActive,
        bookings: {
            total: extras.stats?.total ?? 0,
            upcoming: extras.stats?.upcoming ?? 0,
            lastBookedAt: extras.stats?.lastBookedAt ? extras.stats.lastBookedAt.toISOString() : null,
        },
        ownerCalendar: extras.ownerCalendar,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/** What the audit diff compares (the stored columns, JSON parsed). */
const auditView = (row: BookingLink) => {
    const link = toLinkConfig(row);
    return {
        slug: row.slug,
        ownerUsername: row.ownerUsername,
        title: row.title,
        followupType: row.followupType,
        durations: link.durations,
        slotStepMinutes: row.slotStepMinutes,
        location: row.location,
        note: row.note,
        availability: link.rules.availability,
        bufferBeforeMinutes: row.bufferBeforeMinutes,
        bufferAfterMinutes: row.bufferAfterMinutes,
        minNoticeMinutes: row.minNoticeMinutes,
        horizonDays: row.horizonDays,
        maxPerDay: row.maxPerDay,
        reminder: row.reminder,
        askPhone: row.askPhone,
        askCompany: row.askCompany,
        relatedModule: row.relatedModule,
        relatedId: row.relatedId,
        isActive: row.isActive,
    };
};

async function decorate(rows: BookingLink[], now: Date): Promise<BookingLinkDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const owners = [...new Set(rows.map((r) => r.ownerUsername))];
    const [users, totals, upcoming, connections] = await Promise.all([
        prisma.user.findMany({ where: { username: { in: owners } }, select: { username: true, fullName: true } }),
        prisma.bookingLinkBooking.groupBy({ by: ['bookingLinkId'], where: { bookingLinkId: { in: ids } }, _count: { _all: true }, _max: { createdAt: true } }),
        prisma.bookingLinkBooking.groupBy({ by: ['bookingLinkId'], where: { bookingLinkId: { in: ids }, startAt: { gte: now } }, _count: { _all: true } }),
        prisma.calendarConnection.findMany({ where: { username: { in: owners }, status: { in: [...LIVE_CONNECTION_STATUSES] } }, select: { username: true, status: true } }),
    ]);
    const nameOf = new Map(users.map((u) => [u.username.toLowerCase(), (u.fullName || '').trim() || u.username]));
    const totalOf = new Map(totals.map((t) => [t.bookingLinkId, t]));
    const upcomingOf = new Map(upcoming.map((t) => [t.bookingLinkId, t._count._all]));
    const calendarOf = new Map(connections.map((c) => [c.username.toLowerCase(), c.status === 'error' ? 'error' : 'synced'] as const));
    const related = await Promise.all(
        rows.map(async (row) => {
            if (!row.relatedModule || !row.relatedId || !(row.relatedModule in RELATED_LOADERS)) return null;
            const found = await RELATED_LOADERS[row.relatedModule as ActivityRelatedModule].find(prisma as unknown as TransactionClient, row.relatedId);
            return found && !found.isDeleted ? { code: found.code, label: found.label } : null;
        }),
    );
    return rows.map((row, i) =>
        toBookingLinkDto(row, {
            ownerName: nameOf.get(row.ownerUsername.toLowerCase()) ?? row.ownerUsername,
            stats: {
                total: totalOf.get(row.id)?._count._all ?? 0,
                upcoming: upcomingOf.get(row.id) ?? 0,
                lastBookedAt: totalOf.get(row.id)?._max.createdAt ?? null,
            },
            related: related[i],
            ownerCalendar: calendarOf.get(row.ownerUsername.toLowerCase()) ?? 'not_connected',
        }),
    );
}

// ── Slugs ────────────────────────────────────────────────────────────────────

/** No 0/o, 1/l: a slug read aloud or retyped survives. 32 characters → 8 of them = 40 bits. */
const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const SLUG_RANDOM_LENGTH = 8;

/** Lower-case ASCII words joined by dashes (accents dropped), at most `max` characters, no dash at either end. */
export function slugPart(text: string, max: number): string {
    return text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/g, '');
}

/** `<first name>-<title>-<8 random>` (≤ 60 characters). Unguessable by its random part (no link enumeration). */
export function newSlug(ownerName: string, title: string, random: (n: number) => number = randomInt): string {
    const suffix = Array.from({ length: SLUG_RANDOM_LENGTH }, () => SLUG_ALPHABET[random(SLUG_ALPHABET.length)]).join('');
    const first = slugPart(ownerName.split(/\s+/)[0] ?? '', 16);
    const words = [first, slugPart(title, 30)].filter(Boolean).join('-').slice(0, 50).replace(/-+$/g, '');
    return words ? `${words}-${suffix}` : suffix;
}

async function freeSlug(tx: TransactionClient, ownerName: string, title: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = newSlug(ownerName, title);
        if (!(await tx.bookingLink.findUnique({ where: { slug }, select: { id: true } }))) return slug;
    }
    throw new HttpError('Could not make a new address. Please try again.', StatusCodes.SERVICE_UNAVAILABLE, { code: 'SERVER_BUSY' });
}

// ── Checks ───────────────────────────────────────────────────────────────────

const ownerLockKey = (username: string) => `booking:links:${username.trim().toLowerCase()}`;
const linkLockKey = (id: string) => `booking:link:${id}`;

function assertEnabled(settings: BookingSettings): void {
    if (!settings.enabled) {
        throw new HttpError('Booking links are turned off for the company. An admin can turn them on in Admin › API Integrations.', StatusCodes.CONFLICT, {
            code: BOOKING_ERROR_CODES.off,
        });
    }
}

function assertMayCreate(user: AuthUser, settings: BookingSettings): void {
    if (!roleMayOwnLinks(user, settings.whoCanCreate)) {
        throw new HttpError("Your role can't create booking links. Ask an admin.", StatusCodes.FORBIDDEN, { code: BOOKING_ERROR_CODES.notAllowed });
    }
}

/** Active Followup Types a link may use (not Task / Note). Empty when the list isn't configured (then any but those). */
async function bookableTypes(): Promise<Set<string> | null> {
    const { loadActivityConfig } = await import('../activities/activity.service.js');
    const config = await loadActivityConfig();
    const options = config.followupTypes?.options;
    if (!options) return null;
    return new Set(options.filter((o) => o.isActive && o.value !== TASK_TYPE && o.value !== NOTE_TYPE).map((o) => o.value));
}

function assertType(type: string, allowed: Set<string> | null): void {
    const refused = type === TASK_TYPE || type === NOTE_TYPE || (allowed !== null && !allowed.has(type));
    if (refused) {
        const message = 'Pick an activity type from the list (Task and Note can’t be booked).';
        throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['followupType'] }] });
    }
}

async function assertRelated(user: AuthUser, module: ActivityRelatedModule | null | undefined, id: string | null | undefined): Promise<void> {
    if (!module || !id) return;
    const found = await RELATED_LOADERS[module].find(prisma as unknown as TransactionClient, id);
    if (!found || found.isDeleted) {
        const message = `The selected ${RELATED_LOADERS[module].label} does not exist.`;
        throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['relatedId'] }] });
    }
    if (!canAccessRecord(user, found)) throw HttpError.forbidden("You can't link booked meetings to a record you don't have access to.");
}

async function activeOwner(username: string): Promise<{ username: string; fullName: string }> {
    const owner = await prisma.user.findUnique({ where: { username }, select: { username: true, fullName: true, isActive: true, isGroupUser: true } });
    if (!owner || !owner.isActive || owner.isGroupUser) {
        const message = 'Pick an active colleague (not a shared login).';
        throw new HttpError(message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: [{ message, path: ['ownerUsername'] }] });
    }
    return { username: owner.username, fullName: (owner.fullName || '').trim() || owner.username };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The link if `user` may manage it (owner or admin), else 404. */
async function manageable(id: string, user: AuthUser, db: TransactionClient | typeof prisma = prisma): Promise<BookingLink> {
    const row = await db.bookingLink.findUnique({ where: { id } });
    if (!row || (!isBookingAdmin(user) && !sameName(row.ownerUsername, user.username))) throw HttpError.notFound('Booking link not found');
    return row;
}

/** Column values of a patch (JSON columns serialized). */
function columnsOf(input: UpdateLinkInput): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;
        if (key === 'durations') data.durationsJson = JSON.stringify(value);
        else if (key === 'availability') data.availabilityJson = JSON.stringify(value);
        else if (key === 'location' || key === 'note') data[key] = value ?? null;
        else data[key] = value;
    }
    return data;
}

const DEFAULT_AVAILABILITY: WeeklyAvailability = Object.fromEntries(
    BOOKING_WEEKDAYS.slice(0, 5).map((day) => [day, [{ start: '10:00', end: '13:00' }, { start: '14:00', end: '18:00' }]]),
);

// ── Service ──────────────────────────────────────────────────────────────────

export const bookingLinkService = {
    async access(user: AuthUser): Promise<BookingAccess> {
        return bookingAccessOf(user, await loadBookingSettings());
    },

    async list(query: unknown, user: AuthUser): Promise<{ access: BookingAccess; links: BookingLinkDto[] }> {
        const { scope } = linkListQuerySchema.parse(query ?? {});
        const access = bookingAccessOf(user, await loadBookingSettings());
        if (scope === 'all' && !access.isAdmin) throw HttpError.forbidden();
        const rows = await prisma.bookingLink.findMany({
            where: scope === 'all' ? {} : { ownerUsername: user.username },
            orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        });
        return { access, links: await decorate(rows, new Date()) };
    },

    async create(body: unknown, user: AuthUser): Promise<BookingLinkDto> {
        const input = createLinkSchema.parse(body ?? {});
        const settings = await loadBookingSettings();
        assertEnabled(settings);
        const forSelf = !input.ownerUsername || sameName(input.ownerUsername, user.username);
        if (!forSelf && !isBookingAdmin(user)) throw HttpError.forbidden('Only admins can create a booking link for a colleague.');
        if (forSelf) assertMayCreate(user, settings);
        const owner = await activeOwner(forSelf ? user.username : input.ownerUsername!);
        const followupType = input.followupType ?? BOOKING_DEFAULTS.followupType;
        assertType(followupType, await bookableTypes());
        await assertRelated(user, input.relatedModule, input.relatedId);

        const row = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [ownerLockKey(owner.username)]);
            const count = await tx.bookingLink.count({ where: { ownerUsername: owner.username } });
            if (count >= BOOKING_MAX_LINKS_PER_OWNER) {
                throw new HttpError(`A person can have at most ${BOOKING_MAX_LINKS_PER_OWNER} booking links. Turn one off and change it instead.`, StatusCodes.CONFLICT, {
                    code: BOOKING_ERROR_CODES.limit,
                });
            }
            const created = await tx.bookingLink.create({
                data: {
                    slug: await freeSlug(tx, owner.fullName, input.title),
                    ownerUsername: owner.username,
                    title: input.title,
                    followupType,
                    durationsJson: JSON.stringify(input.durations ?? BOOKING_DEFAULTS.durations),
                    slotStepMinutes: (input.slotStepMinutes ?? BOOKING_DEFAULTS.slotStepMinutes) as BookingSlotStep,
                    location: input.location ?? null,
                    note: input.note ?? null,
                    availabilityJson: JSON.stringify(input.availability ?? DEFAULT_AVAILABILITY),
                    bufferBeforeMinutes: input.bufferBeforeMinutes ?? BOOKING_DEFAULTS.bufferBeforeMinutes,
                    bufferAfterMinutes: input.bufferAfterMinutes ?? BOOKING_DEFAULTS.bufferAfterMinutes,
                    minNoticeMinutes: input.minNoticeMinutes ?? BOOKING_DEFAULTS.minNoticeMinutes,
                    horizonDays: input.horizonDays ?? BOOKING_DEFAULTS.horizonDays,
                    maxPerDay: input.maxPerDay ?? null,
                    reminder: input.reminder === undefined ? BOOKING_DEFAULTS.reminder : input.reminder,
                    askPhone: input.askPhone ?? false,
                    askCompany: input.askCompany ?? false,
                    relatedModule: input.relatedModule ?? null,
                    relatedId: input.relatedId ?? null,
                    isActive: input.isActive ?? true,
                    createdBy: user.username,
                },
            });
            await auditService.record(tx, { entityType: 'BookingLink', entityId: created.id, action: 'CREATE', changedBy: user.username, changes: auditView(created) });
            return created;
        });
        await dropLinkCache(row.slug);
        return (await decorate([row], new Date()))[0];
    },

    async update(id: string, body: unknown, user: AuthUser): Promise<BookingLinkDto> {
        const input = updateLinkSchema.parse(body ?? {});
        const settings = await loadBookingSettings();
        const onlyTurnOff = Object.keys(input).length === 1 && input.isActive === false;
        if (!onlyTurnOff) {
            assertEnabled(settings);
            const existing = await manageable(id, user);
            if (sameName(existing.ownerUsername, user.username) && !isBookingAdmin(user)) assertMayCreate(user, settings);
            if (input.followupType !== undefined) assertType(input.followupType, await bookableTypes());
            if (input.relatedModule !== undefined || input.relatedId !== undefined) await assertRelated(user, input.relatedModule, input.relatedId);
        }
        const { before, after } = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [linkLockKey(id)]);
            const current = await manageable(id, user, tx);
            const updated = await tx.bookingLink.update({ where: { id }, data: { ...columnsOf(input), updatedBy: user.username } });
            const changes = diffRecords(auditView(current), auditView(updated));
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'BookingLink', entityId: id, action: 'UPDATE', changedBy: user.username, changes });
            }
            return { before: current, after: updated };
        });
        await dropLinkCache(before.slug, after.slug);
        return (await decorate([after], new Date()))[0];
    },

    /** A new random address: the old `/book/<slug>` stops answering at once (404), the settings stay. */
    async newAddress(id: string, user: AuthUser): Promise<BookingLinkDto> {
        assertEnabled(await loadBookingSettings());
        const { before, after } = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [linkLockKey(id)]);
            const current = await manageable(id, user, tx);
            const owner = await tx.user.findUnique({ where: { username: current.ownerUsername }, select: { fullName: true } });
            const slug = await freeSlug(tx, (owner?.fullName || '').trim() || current.ownerUsername, current.title);
            const updated = await tx.bookingLink.update({ where: { id }, data: { slug, updatedBy: user.username } });
            await auditService.record(tx, { entityType: 'BookingLink', entityId: id, action: 'UPDATE', changedBy: user.username, changes: { slug: { from: current.slug, to: slug } } });
            return { before: current, after: updated };
        });
        await dropLinkCache(before.slug, after.slug);
        return (await decorate([after], new Date()))[0];
    },

    /** The link's latest 50 bookings, newest first, with the state of each activity. */
    async bookings(id: string, user: AuthUser) {
        const link = await manageable(id, user);
        const rows = await prisma.bookingLinkBooking.findMany({ where: { bookingLinkId: link.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
        const activities = rows.length
            ? await prisma.activity.findMany({ where: { id: { in: rows.map((r) => r.activityId) } }, select: { id: true, status: true, isDeleted: true } })
            : [];
        const stateOf = new Map(activities.map((a) => [a.id, a.isDeleted ? 'Deleted' : a.status]));
        return rows.map((r) => ({
            id: r.id,
            activityId: r.activityId,
            activityStatus: stateOf.get(r.activityId) ?? 'Deleted',
            start: r.startAt.toISOString(),
            end: r.endAt.toISOString(),
            visitorName: r.visitorName,
            visitorEmail: r.visitorEmail,
            visitorPhone: r.visitorPhone ?? '',
            visitorCompany: r.visitorCompany ?? '',
            contactId: r.contactId,
            createdAt: r.createdAt.toISOString(),
        }));
    },

    async settings(): Promise<BookingSettings> {
        return loadBookingSettings();
    },

    saveSettings: saveBookingSettings,

    /** Exposed for the public page: the business time zone the hours are kept in. */
    timeZone: () => ENV.BUSINESS_TIMEZONE,
};
