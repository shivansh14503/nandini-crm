import type { TransactionClient } from '../../config/prisma.js';
import { prisma } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import { CACHE_KEYS, cacheService } from '../../services/cache.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { normalizePlaceName } from '../../utils/cityMaster.js';
import { HttpError } from '../../utils/httpError.js';
import { acquireLocks, runInTransaction } from '../shared/transactions.js';
import { getCountry, getSubdivision } from './addressPlaces.js';
import { shownNumberModules } from '../document-series/documentSeries.service.js';
import { CITY_ADDRESS_BLOCKS, CITY_OWNER_LABELS, CITY_OWNERS, cityOwnerDelegate, type CityOwner } from './cityAddresses.js';
import { cityCreateSchema, cityDeleteSchema, cityListQuerySchema, cityRenameSchema } from './city.validator.js';

/**
 * Admin management of the city master (Form Customization → Dropdowns → Address cities). Records point at cities by
 * id, so: a rename writes the new name through to every record; a delete first moves the records to another city
 * of the same state or clears their city. Seeded cities are hidden rather than deleted so the seed never re-adds them.
 */

export interface AdminCityDto {
    id: number;
    cityName: string;
    countryIso2: string;
    subdivisionCode: string | null;
    population: number | null;
    /** From the city master file (false = added by an admin). */
    isSeeded: boolean;
    /** Live records (organizations, leads, quotations, partner companies) whose address uses this city. */
    usageCount: number;
}

export interface CityUsageRecord {
    id: string;
    code: string;
    name: string;
}

export interface CityUsageGroup {
    owner: CityOwner;
    label: string;
    count: number;
    /** The first few records, for the confirmation dialog. */
    records: CityUsageRecord[];
}

export interface CityUsage {
    total: number;
    groups: CityUsageGroup[];
}

const USAGE_SAMPLE_SIZE = 5;

const CITY_SELECT = { id: true, cityName: true, countryIso2: true, subdivisionCode: true, population: true, seedKey: true } as const;
type CityRow = Prisma.CityGetPayload<{ select: typeof CITY_SELECT }>;

/** How each owner's records are named in the usage dialog. */
const USAGE_SELECT: Record<CityOwner, { code?: string; name: string }> = {
    organization: { code: 'accountCode', name: 'organizationName' },
    lead: { code: 'leadCode', name: 'name' },
    quotation: { code: 'quotationCode', name: 'quotationTitle' },
    partnerCompany: { name: 'partnerName' },
};

const toDto = (row: CityRow, usageCount = 0): AdminCityDto => ({
    id: row.id,
    cityName: row.cityName,
    countryIso2: row.countryIso2,
    subdivisionCode: row.subdivisionCode,
    population: row.population,
    isSeeded: row.seedKey !== null,
    usageCount,
});

/** `{ OR: [billingCityId = id, shippingCityId = id] }` for one owner. */
const usesCity = (owner: CityOwner, cityIds: number | number[]) => ({
    OR: CITY_ADDRESS_BLOCKS[owner].map((b) => ({ [b.idField]: Array.isArray(cityIds) ? { in: cityIds } : cityIds })),
});

/** Live-record usage count per city id. A record using a city in both its addresses counts once. */
async function usageCounts(client: TransactionClient, cityIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (cityIds.length === 0) return counts;
    for (const owner of CITY_OWNERS) {
        const rows = await cityOwnerDelegate(client, owner).findMany({
            where: { isDeleted: false, ...usesCity(owner, cityIds) },
            select: Object.fromEntries([['id', true], ...CITY_ADDRESS_BLOCKS[owner].map((b) => [b.idField, true])]),
        });
        for (const row of rows) {
            const ids = new Set(CITY_ADDRESS_BLOCKS[owner].map((b) => row[b.idField] as number | null).filter((id): id is number => id !== null));
            for (const id of ids) if (cityIds.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }
    return counts;
}

async function cityUsage(client: TransactionClient, cityId: number): Promise<CityUsage> {
    const groups: CityUsageGroup[] = [];
    const shown = await shownNumberModules(client);
    for (const owner of CITY_OWNERS) {
        const delegate = cityOwnerDelegate(client, owner);
        const where = { isDeleted: false, ...usesCity(owner, cityId) };
        const count = await delegate.count({ where });
        if (count === 0) continue;
        const { name } = USAGE_SELECT[owner];
        // Numbers without an admin-added series stay in the backend.
        const code = owner !== 'partnerCompany' && shown.has(owner) ? USAGE_SELECT[owner].code : undefined;
        const rows = await delegate.findMany({
            where,
            select: { id: true, [name]: true, ...(code ? { [code]: true } : {}) },
            orderBy: { [name]: 'asc' },
            take: USAGE_SAMPLE_SIZE,
        });
        groups.push({
            owner,
            label: count === 1 ? CITY_OWNER_LABELS[owner].singular : CITY_OWNER_LABELS[owner].plural,
            count,
            records: rows.map((r) => ({ id: String(r.id), code: code ? String(r[code] ?? '') : '', name: String(r[name] ?? '') })),
        });
    }
    return { total: groups.reduce((sum, g) => sum + g.count, 0), groups };
}

async function findVisibleCity(client: TransactionClient, id: number): Promise<CityRow> {
    const row = await client.city.findFirst({ where: { id, isHidden: false }, select: CITY_SELECT });
    if (!row) throw HttpError.notFound('City not found. It may have been removed by another admin.');
    return row;
}

/** Serializes adds / renames of the same name in the same state, so two admins can't create a duplicate. */
const nameLock = (countryIso2: string, subdivisionCode: string | null, searchName: string) =>
    `city:${subdivisionCode ?? countryIso2}:${searchName}`.slice(0, 250);

async function assertNameFree(
    tx: TransactionClient,
    scope: { countryIso2: string; subdivisionCode: string | null },
    cityName: string,
    excludeId?: number,
): Promise<void> {
    const clash = await tx.city.findFirst({
        where: {
            searchName: normalizePlaceName(cityName),
            countryIso2: scope.countryIso2,
            subdivisionCode: scope.subdivisionCode,
            isHidden: false,
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { cityName: true },
    });
    if (clash) {
        const message = `"${clash.cityName}" is already in this state's city list.`;
        throw HttpError.conflict(message, [{ message, path: ['cityName'] }]);
    }
}

/** Writes `data` into every live address block that uses `cityId`; returns updated records per owner. */
async function rewriteAddresses(
    tx: TransactionClient,
    cityId: number,
    dataFor: (block: (typeof CITY_ADDRESS_BLOCKS)[CityOwner][number]) => Record<string, unknown>,
    actor: AuthUser,
): Promise<Partial<Record<CityOwner, number>>> {
    const counts: Partial<Record<CityOwner, number>> = {};
    for (const owner of CITY_OWNERS) {
        const delegate = cityOwnerDelegate(tx, owner);
        const touched = new Set<string>();
        for (const b of CITY_ADDRESS_BLOCKS[owner]) {
            const where = { isDeleted: false, [b.idField]: cityId };
            const ids = await delegate.findMany({ where, select: { id: true } });
            if (ids.length === 0) continue;
            await delegate.updateMany({ where, data: { ...dataFor(b), updatedBy: actor.username } });
            for (const r of ids) touched.add(String(r.id));
        }
        if (touched.size > 0) counts[owner] = touched.size;
    }
    return counts;
}

/** Drops every state's cached city list and the entity caches of the record owners a rename / delete rewrote. */
export async function invalidateCityCaches(owners: Partial<Record<CityOwner, number>> = {}): Promise<void> {
    await Promise.all([
        cacheService.invalidatePattern(`${CACHE_KEYS.addressMaster}:cities:*`),
        ...(Object.keys(owners) as CityOwner[]).map((owner) => cacheService.invalidateEntityCaches(CITY_OWNER_LABELS[owner].entity)),
    ]);
}

export const cityService = {
    /** One page of a country's (or a state's) cities, alphabetical, with how many records use each. */
    async list(query: unknown): Promise<{ data: AdminCityDto[]; total: number; page: number; limit: number }> {
        const { country, state, search, page, limit } = cityListQuerySchema.parse(query ?? {});
        const term = normalizePlaceName(search);
        const where: Prisma.CityWhereInput = {
            isHidden: false,
            countryIso2: country,
            ...(state ? { subdivisionCode: state } : {}),
            ...(term ? { searchName: { contains: term } } : {}),
        };
        const [total, rows] = await Promise.all([
            prisma.city.count({ where }),
            prisma.city.findMany({ where, select: CITY_SELECT, orderBy: [{ searchName: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
        ]);
        const counts = await usageCounts(prisma, rows.map((r) => r.id));
        return { data: rows.map((r) => toDto(r, counts.get(r.id) ?? 0)), total, page, limit };
    },

    /** The live records whose address uses a city (for the delete dialog). */
    async usage(id: number): Promise<CityUsage> {
        await findVisibleCity(prisma, id);
        return cityUsage(prisma, id);
    },

    async create(body: unknown, actor: AuthUser): Promise<AdminCityDto> {
        const input = cityCreateSchema.parse(body ?? {});
        const country = await getCountry(input.countryIso2);
        if (!country) throw HttpError.badRequest('Select a country.', [{ message: 'Unknown country.', path: ['countryIso2'] }]);
        const subdivisionCode = input.subdivisionCode ?? null;
        if (subdivisionCode && (await getSubdivision(subdivisionCode))?.countryIso2 !== country.iso2Code) {
            throw HttpError.badRequest('Select a state of this country.', [{ message: 'Unknown state.', path: ['subdivisionCode'] }]);
        }
        const searchName = normalizePlaceName(input.cityName);

        const saved = await runInTransaction(async (tx) => {
            await acquireLocks(tx, [nameLock(country.iso2Code, subdivisionCode, searchName)]);
            await assertNameFree(tx, { countryIso2: country.iso2Code, subdivisionCode }, input.cityName);
            // A removed seeded city with this name comes back (keeping its seed key) instead of being duplicated.
            const hidden = await tx.city.findFirst({
                where: { searchName, countryIso2: country.iso2Code, subdivisionCode, isHidden: true },
                select: { id: true },
            });
            const row = hidden
                ? await tx.city.update({ where: { id: hidden.id }, data: { isHidden: false, cityName: input.cityName }, select: CITY_SELECT })
                : await tx.city.create({
                      data: { countryIso2: country.iso2Code, subdivisionCode, cityName: input.cityName, searchName: searchName.slice(0, 150) },
                      select: CITY_SELECT,
                  });
            await auditService.record(tx, {
                entityType: 'City',
                entityId: String(row.id),
                action: 'CREATE',
                changedBy: actor.username,
                changes: { cityName: row.cityName, countryIso2: row.countryIso2, subdivisionCode: row.subdivisionCode, restored: Boolean(hidden) },
            });
            return row;
        });
        await invalidateCityCaches();
        return toDto(saved, 0);
    },

    /** Renames a city and writes the new name into every record that uses it. */
    async rename(id: number, body: unknown, actor: AuthUser): Promise<{ city: AdminCityDto; updatedRecords: Partial<Record<CityOwner, number>> }> {
        const { cityName } = cityRenameSchema.parse(body ?? {});
        const searchName = normalizePlaceName(cityName);

        const result = await runInTransaction(async (tx) => {
            const before = await findVisibleCity(tx, id);
            if (before.cityName === cityName) return { row: before, updatedRecords: {} };
            await acquireLocks(tx, [nameLock(before.countryIso2, before.subdivisionCode, searchName)]);
            await assertNameFree(tx, before, cityName, id);
            const row = await tx.city.update({ where: { id }, data: { cityName, searchName: searchName.slice(0, 150) }, select: CITY_SELECT });
            const updatedRecords = await rewriteAddresses(
                tx,
                id,
                (b) => Object.fromEntries([[b.cityField, cityName], ...(b.mirrorFields ?? []).map((m) => [m, cityName])]),
                actor,
            );
            await auditService.record(tx, {
                entityType: 'City',
                entityId: String(id),
                action: 'UPDATE',
                changedBy: actor.username,
                changes: { cityName: { from: before.cityName, to: cityName }, updatedRecords },
            });
            return { row, updatedRecords };
        });
        await invalidateCityCaches(result.updatedRecords);
        const counts = await usageCounts(prisma, [id]);
        return { city: toDto(result.row, counts.get(id) ?? 0), updatedRecords: result.updatedRecords };
    },

    /**
     * Removes a city from the list. When live records use it, `action` says what happens to them first: `move`
     * (to `targetCityId`, a city of the same state) or `clear`. Without an action a used city is refused with a
     * 409 carrying the usage, so the dialog can ask.
     */
    async remove(id: number, body: unknown, actor: AuthUser): Promise<{ action: 'move' | 'clear' | null; updatedRecords: Partial<Record<CityOwner, number>> }> {
        const { action, targetCityId } = cityDeleteSchema.parse(body ?? {});

        const result = await runInTransaction(async (tx) => {
            const city = await findVisibleCity(tx, id);
            const usage = await cityUsage(tx, id);
            if (usage.total > 0 && !action) {
                const err = HttpError.conflict(
                    `${city.cityName} is used by ${usage.total} record${usage.total === 1 ? '' : 's'}. Move them to another city or clear their city first.`,
                );
                err.code = 'CITY_IN_USE';
                throw err;
            }

            let updatedRecords: Partial<Record<CityOwner, number>> = {};
            if (usage.total > 0 && action === 'move') {
                if (targetCityId === id) throw HttpError.badRequest('Pick a different city to move the records to.');
                const target = await tx.city.findFirst({ where: { id: targetCityId, isHidden: false }, select: CITY_SELECT });
                if (!target || target.countryIso2 !== city.countryIso2 || target.subdivisionCode !== city.subdivisionCode) {
                    throw HttpError.badRequest('Records can only be moved to another city of the same state.', [
                        { message: 'Pick a city of the same state.', path: ['targetCityId'] },
                    ]);
                }
                updatedRecords = await rewriteAddresses(
                    tx,
                    id,
                    (b) => Object.fromEntries([[b.idField, target.id], [b.cityField, target.cityName], ...(b.mirrorFields ?? []).map((m) => [m, target.cityName])]),
                    actor,
                );
            } else if (usage.total > 0 && action === 'clear') {
                updatedRecords = await rewriteAddresses(
                    tx,
                    id,
                    (b) => Object.fromEntries([[b.idField, null], [b.cityField, b.required ? '' : null], ...(b.mirrorFields ?? []).map((m) => [m, null])]),
                    actor,
                );
            }

            // Deleted records may still point at it: then (and for seeded cities) it is hidden instead of deleted.
            let stillReferenced = false;
            for (const owner of CITY_OWNERS) {
                if ((await cityOwnerDelegate(tx, owner).count({ where: usesCity(owner, id) })) > 0) {
                    stillReferenced = true;
                    break;
                }
            }
            if (city.seedKey !== null || stillReferenced) await tx.city.update({ where: { id }, data: { isHidden: true } });
            else await tx.city.delete({ where: { id } });

            await auditService.record(tx, {
                entityType: 'City',
                entityId: String(id),
                action: 'DELETE',
                changedBy: actor.username,
                changes: { cityName: city.cityName, action: usage.total > 0 ? action : null, targetCityId: action === 'move' ? targetCityId : undefined, updatedRecords },
            });
            return { action: usage.total > 0 ? (action ?? null) : null, updatedRecords };
        });
        await invalidateCityCaches(result.updatedRecords);
        return result;
    },
};
