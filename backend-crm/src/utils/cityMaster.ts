/**
 * Shared by the city master build script, the seed and the city lookup: place-name normalisation and the
 * small CSV reader/writer for `prisma/seed-data/cities.csv.gz`.
 */

/**
 * Search key for a place name: no diacritics, lowercase, punctuation collapsed to single spaces.
 * 'Thiruvananthapuram' → 'thiruvananthapuram', 'Île-de-France' → 'ile de france', 'Saint-Étienne' → 'saint etienne'.
 * Mirrors the frontend's `normalizeSearchText` so a typed query finds the same names on both sides.
 */
export function normalizePlaceName(text?: string | null): string {
    return (text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/** RFC 4180 CSV → rows of strings (quoted fields, doubled quotes, CRLF/LF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else quoted = false;
            } else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
}

/** CSV rows → records keyed by the header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
    const [header, ...rows] = parseCsv(text);
    if (!header) return [];
    const keys = header.map((h) => h.trim());
    return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function toCsv(rows: readonly (readonly string[])[]): string {
    return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

/** One row of `seed-data/cities.csv.gz`. */
export interface CityMasterRow {
    countryIso2: string;
    /** ISO 3166-2 code, or '' when the source state couldn't be matched. */
    subdivisionCode: string;
    cityName: string;
    /** '' when unknown. */
    population: string;
}

export const CITY_MASTER_HEADER = ['country_iso2', 'subdivision_code', 'city_name', 'population'] as const;

/** Population column → INT (null when blank, invalid or out of INT range). */
export function parsePopulation(value?: string | null): number | null {
    const n = Number(value);
    return value && Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}
