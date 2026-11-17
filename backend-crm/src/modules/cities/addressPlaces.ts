import { prisma } from '../../config/prisma.js';
import { normalizePlaceName } from '../../utils/cityMaster.js';

/**
 * Server-side twin of the frontend's address master helpers (frontend-crm/src/data/addressMaster.ts): turns the
 * country / state values address forms store (names, or ISO codes) into ISO codes. Countries and subdivisions only
 * change when the seed runs, so they are loaded once per process.
 */

export interface PlaceCountry {
    iso2Code: string;
    countryName: string;
}

export interface PlaceSubdivision {
    subdivisionCode: string;
    countryIso2: string;
    subdivisionName: string;
}

// Common names / abbreviations that differ from the ISO short names (same list as the frontend).
const COUNTRY_ALIASES: Record<string, string> = {
    usa: 'US',
    'united states of america': 'US',
    america: 'US',
    uk: 'GB',
    'great britain': 'GB',
    britain: 'GB',
    england: 'GB',
    uae: 'AE',
    russia: 'RU',
    'south korea': 'KR',
    korea: 'KR',
    'north korea': 'KP',
    vietnam: 'VN',
    iran: 'IR',
    syria: 'SY',
    laos: 'LA',
    bolivia: 'BO',
    venezuela: 'VE',
    tanzania: 'TZ',
    moldova: 'MD',
    taiwan: 'TW',
    'czech republic': 'CZ',
    turkey: 'TR',
    'ivory coast': 'CI',
    burma: 'MM',
    'hong kong': 'HK',
};

// Pre-ISO / colloquial Indian state names still found in older records and imports.
const LEGACY_SUBDIVISION_ALIASES: Record<string, Record<string, string>> = {
    IN: {
        orissa: 'IN-OD',
        pondicherry: 'IN-PY',
        uttaranchal: 'IN-UK',
        'new delhi': 'IN-DL',
        'nct of delhi': 'IN-DL',
        'national capital territory of delhi': 'IN-DL',
        'dadra and nagar haveli': 'IN-DH',
        'daman and diu': 'IN-DH',
        'andaman and nicobar': 'IN-AN',
        'j and k': 'IN-JK',
    },
};

interface PlaceIndex {
    countries: Map<string, PlaceCountry>;
    countryByKey: Map<string, string>;
    subdivisions: Map<string, PlaceSubdivision>;
    subdivisionsByCountry: Map<string, PlaceSubdivision[]>;
}

let index: Promise<PlaceIndex> | null = null;

async function buildIndex(): Promise<PlaceIndex> {
    const [countryRows, subdivisionRows] = await Promise.all([
        prisma.country.findMany({ select: { iso2Code: true, countryName: true, iso3Code: true } }),
        prisma.subdivision.findMany({ select: { subdivisionCode: true, countryIso2: true, subdivisionName: true } }),
    ]);
    const countries = new Map(countryRows.map((c) => [c.iso2Code, { iso2Code: c.iso2Code, countryName: c.countryName }]));
    const countryByKey = new Map<string, string>();
    for (const c of countryRows) {
        countryByKey.set(normalizePlaceName(c.countryName), c.iso2Code);
        countryByKey.set(c.iso3Code.toLowerCase(), c.iso2Code);
    }
    for (const [alias, iso2] of Object.entries(COUNTRY_ALIASES)) {
        if (countries.has(iso2) && !countryByKey.has(alias)) countryByKey.set(alias, iso2);
    }
    const subdivisions = new Map(subdivisionRows.map((s) => [s.subdivisionCode, s]));
    const subdivisionsByCountry = new Map<string, PlaceSubdivision[]>();
    for (const s of subdivisionRows) {
        const list = subdivisionsByCountry.get(s.countryIso2) ?? [];
        list.push(s);
        subdivisionsByCountry.set(s.countryIso2, list);
    }
    return { countries, countryByKey, subdivisions, subdivisionsByCountry };
}

function places(): Promise<PlaceIndex> {
    index ??= buildIndex().catch((err) => {
        index = null;
        throw err;
    });
    return index;
}

/** Forgets the loaded countries / subdivisions (tests, or after the seed changed them in this process). */
export function resetPlaceIndex(): void {
    index = null;
}

/** ISO2 code for an ISO2 / ISO3 code or a country name ('India' → 'IN', 'usa' → 'US'); null when unrecognised. */
export async function resolveCountry(input?: string | null): Promise<PlaceCountry | null> {
    const raw = (input ?? '').trim();
    if (!raw) return null;
    const { countries, countryByKey } = await places();
    const upper = raw.toUpperCase();
    const iso2 = upper.length === 2 && countries.has(upper) ? upper : countryByKey.get(normalizePlaceName(raw));
    return (iso2 && countries.get(iso2)) || null;
}

export async function getCountry(iso2?: string | null): Promise<PlaceCountry | null> {
    return iso2 ? ((await places()).countries.get(iso2.toUpperCase()) ?? null) : null;
}

export async function getSubdivision(code?: string | null): Promise<PlaceSubdivision | null> {
    return code ? ((await places()).subdivisions.get(code.toUpperCase()) ?? null) : null;
}

/** The subdivision of `countryIso2` a state value names (name, full code 'IN-DL', suffix 'DL' or legacy alias). */
export async function resolveSubdivision(stateInput: string | null | undefined, countryIso2: string): Promise<PlaceSubdivision | null> {
    const raw = (stateInput ?? '').trim();
    if (!raw) return null;
    const list = (await places()).subdivisionsByCountry.get(countryIso2) ?? [];
    const key = normalizePlaceName(raw);
    const upper = raw.toUpperCase();
    const aliasCode = LEGACY_SUBDIVISION_ALIASES[countryIso2]?.[key];
    return (
        list.find(
            (s) =>
                normalizePlaceName(s.subdivisionName) === key ||
                s.subdivisionCode === upper ||
                s.subdivisionCode === `${countryIso2}-${upper}` ||
                s.subdivisionCode === aliasCode,
        ) ?? null
    );
}
