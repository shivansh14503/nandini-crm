import type { TransactionClient } from '../../config/prisma.js';
import { prisma } from '../../config/prisma.js';
import type { CachedEntity } from '../../services/cache.service.js';
import { normalizePlaceName } from '../../utils/cityMaster.js';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { getSubdivision, resolveCountry, resolveSubdivision } from './addressPlaces.js';

/**
 * Address cities must come from the city master. Every address block stores the picked City's id
 * (`<prefix>CityId`) next to its name (`<prefix>City`, which lists, search, PDFs and exports read); an admin rename
 * writes the new name through to every block that references the city.
 */

export type CityOwner = 'organization' | 'lead' | 'quotation' | 'partnerCompany';

export interface CityAddressBlock {
    idField: string;
    cityField: string;
    stateField: string;
    countryField: string;
    /** Other columns that mirror this block's city name (partner companies' lookup `city`). */
    mirrorFields?: string[];
    /** Column is NOT NULL: a cleared city is stored as ''. */
    required?: boolean;
}

const block = (prefix: string, extra: Partial<CityAddressBlock> = {}): CityAddressBlock => ({
    idField: `${prefix}CityId`,
    cityField: `${prefix}City`,
    stateField: `${prefix}State`,
    countryField: `${prefix}Country`,
    ...extra,
});

export const CITY_ADDRESS_BLOCKS: Record<CityOwner, CityAddressBlock[]> = {
    organization: [block('billing'), block('shipping')],
    lead: [block('primary'), block('other')],
    quotation: [block('billing', { required: true }), block('shipping')],
    partnerCompany: [block('billing', { mirrorFields: ['city'] }), block('shipping')],
};

export const CITY_OWNER_LABELS: Record<CityOwner, { singular: string; plural: string; entity: CachedEntity }> = {
    organization: { singular: 'organization', plural: 'organizations', entity: 'organizations' },
    lead: { singular: 'lead', plural: 'leads', entity: 'leads' },
    quotation: { singular: 'quotation', plural: 'quotations', entity: 'quotations' },
    partnerCompany: { singular: 'partner company', plural: 'partner companies', entity: 'partner-companies' },
};

export const CITY_OWNERS = Object.keys(CITY_ADDRESS_BLOCKS) as CityOwner[];

/** Prisma delegates indexed by owner, typed loosely: the block columns are only known as strings here. */
interface LooseDelegate {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
    groupBy(args: unknown): Promise<Record<string, unknown>[]>;
}

export function cityOwnerDelegate(client: TransactionClient, owner: CityOwner): LooseDelegate {
    return client[owner] as unknown as LooseDelegate;
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export interface ResolvedCity {
    id: number;
    cityName: string;
    subdivisionCode: string | null;
}

/** Cache of lookups within one resolve call (billing and shipping are often the same address). */
type Memo = Map<string, Promise<ResolvedCity | null>>;

async function findCity(client: TransactionClient, memo: Memo, scope: { subdivisionCode?: string; countryIso2: string }, name: string) {
    const searchName = normalizePlaceName(name);
    const key = `${scope.subdivisionCode ?? scope.countryIso2}|${searchName}`;
    let found = memo.get(key);
    if (!found) {
        found = client.city.findFirst({
            where: { searchName, isHidden: false, ...(scope.subdivisionCode ? { subdivisionCode: scope.subdivisionCode } : { countryIso2: scope.countryIso2 }) },
            // Same name twice in a country without a state picked: the bigger city.
            orderBy: [{ population: 'desc' }, { id: 'asc' }],
            select: { id: true, cityName: true, subdivisionCode: true },
        });
        memo.set(key, found);
    }
    return found;
}

/**
 * Validates each address block against the address masters: the country must be a listed country, the state one of
 * that country's states, and the city one of the city list (looked up within the state, country-wide when no state
 * was picked). Fills in the City id, the city's canonical name and the state's listed spelling (or the city's state
 * when none was picked). The country keeps the form it was sent in (ISO code or name). Throws a 400 naming every
 * field that isn't in its list. Mutates and returns `data`.
 */
export async function resolveAddressPlaces<T extends object>(client: TransactionClient, owner: CityOwner, data: T): Promise<T> {
    const row = data as Record<string, unknown>;
    const memo: Memo = new Map();
    const errors: ApiFieldError[] = [];

    for (const b of CITY_ADDRESS_BLOCKS[owner]) {
        if (!(b.cityField in row)) continue;
        const name = str(row[b.cityField]);
        const stateInput = str(row[b.stateField]);
        const countryInput = str(row[b.countryField]);

        const country = await resolveCountry(countryInput || 'IN');
        if (!country) {
            errors.push({ path: [b.countryField], message: `"${countryInput}" isn't in the country list. Select a country from the list.` });
            continue;
        }
        let state = null;
        if (stateInput) {
            state = await resolveSubdivision(stateInput, country.iso2Code);
            if (!state) {
                errors.push({ path: [b.stateField], message: `"${stateInput}" isn't a state of ${country.countryName}. Select a state from the list.` });
                continue;
            }
            if (b.stateField in row) row[b.stateField] = state.subdivisionName;
        }

        if (!name) {
            row[b.idField] = null;
            for (const mirror of b.mirrorFields ?? []) row[mirror] = row[b.cityField] ?? null;
            continue;
        }
        const city = await findCity(client, memo, { subdivisionCode: state?.subdivisionCode, countryIso2: country.iso2Code }, name);
        if (!city) {
            const where = state?.subdivisionName ?? country.countryName;
            errors.push({ path: [b.cityField], message: `"${name}" isn't in the city list for ${where}. Pick a city from the list, or ask an admin to add it.` });
            continue;
        }
        row[b.idField] = city.id;
        row[b.cityField] = city.cityName;
        for (const mirror of b.mirrorFields ?? []) row[mirror] = city.cityName;
        // A city picked without a state (country-wide search) fills its state in.
        if (!state && city.subdivisionCode && b.stateField in row) {
            const cityState = await getSubdivision(city.subdivisionCode);
            if (cityState) row[b.stateField] = cityState.subdivisionName;
        }
    }

    if (errors.length > 0) throw HttpError.badRequest(errors.length === 1 ? errors[0].message : 'Pick the country, state and city from their lists.', errors);
    return data;
}

/**
 * Links records whose city name has no City id yet (records from before cities were linked, or written straight
 * to the database such as the seed's partner masters). Names that aren't in the list are left as they are and
 * counted. Idempotent; run by the seed.
 */
export async function linkAddressCities(client: TransactionClient = prisma): Promise<{ linked: number; unmatched: number }> {
    let linked = 0;
    let unmatched = 0;
    const memo: Memo = new Map();
    for (const owner of CITY_OWNERS) {
        const delegate = cityOwnerDelegate(client, owner);
        for (const b of CITY_ADDRESS_BLOCKS[owner]) {
            const rows = await delegate.findMany({
                // `> ''` skips both NULL and empty (and works on the NOT NULL quotation billing city).
                where: { [b.idField]: null, [b.cityField]: { gt: '' } },
                select: { id: true, [b.cityField]: true, [b.stateField]: true, [b.countryField]: true },
            });
            for (const r of rows) {
                const country = await resolveCountry(str(r[b.countryField]) || 'IN');
                const state = country ? await resolveSubdivision(str(r[b.stateField]), country.iso2Code) : null;
                const city = country
                    ? await findCity(client, memo, { subdivisionCode: state?.subdivisionCode, countryIso2: country.iso2Code }, str(r[b.cityField]))
                    : null;
                if (!city) {
                    unmatched++;
                    continue;
                }
                const data: Record<string, unknown> = { [b.idField]: city.id, [b.cityField]: city.cityName };
                for (const mirror of b.mirrorFields ?? []) data[mirror] = city.cityName;
                await delegate.updateMany({ where: { id: r.id }, data });
                linked++;
            }
        }
    }
    return { linked, unmatched };
}
