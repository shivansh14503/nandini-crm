/**
 * Builds prisma/seed-data/cities.csv.gz (the city master the seed loads) from the dr5hn
 * countries-states-cities-database CSV export (https://github.com/dr5hn/countries-states-cities-database, ODbL-1.0).
 *
 *   npm run build:city-master -- <path/to/cities.csv[.gz]> [path/to/states.csv]
 *
 * cities: the release asset csv-cities.csv.gz; states: csv/states.csv in the repository.
 *
 * Each city's state is mapped onto our ISO 3166-2 subdivisions (CRM_Address_Master.xlsx → State_Region_Master):
 *   1. `<country_code>-<state_code>` when that is one of the country's subdivision codes ('IN' + 'DL' → 'IN-DL');
 *   2. else states.csv's `iso3166_2` column for the city's state, when that file is given and has the column;
 *   3. else the state's name, compared without case/diacritics/punctuation, against the country's subdivision names.
 * Cities whose state still doesn't match keep an empty subdivision code (found by country search, not by state)
 * and are listed in the summary. Cities of countries missing from the master, and regions/districts listed as
 * cities upstream (EXCLUDED_TYPES, ADMIN_UNIT_NAME), are dropped.
 *
 * Re-run it when the upstream dataset or the address workbook changes, then commit the .gz and run the seed.
 */
import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import {
    CITY_MASTER_HEADER,
    normalizePlaceName,
    parseCsvRecords,
    parsePopulation,
    toCsv,
    type CityMasterRow,
} from '../src/utils/cityMaster.js';

XLSX.set_fs(fs);

const ROOT =resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADDRESS_WORKBOOK = resolve(ROOT, 'prisma', 'seed-data', 'CRM_Address_Master.xlsx');
const OUTPUT = resolve(ROOT, 'prisma', 'seed-data', 'cities.csv.gz');
/** Matches City.cityName's column width. */
const MAX_NAME_LENGTH = 150;
/**
 * Upstream `type`s that are regions or gone places, not somewhere an address is ('Bengaluru Urban', 'Kamrup',
 * 'Los Angeles County'). Types are loose upstream (real cities also appear as adm1/adm2), so only these are dropped.
 */
const EXCLUDED_TYPES = new Set(['area', 'district', 'county', 'abandoned', 'destroyed', 'historical']);
/** Administrative units typed as cities upstream ('Pune Division', 'Lucknow District'). */
const ADMIN_UNIT_NAME = /\s(Division|District)$/i;

interface SubdivisionRow { country_iso2: string; subdivision_code: string; subdivision_name: string }

function fail(message: string): never {
    console.error(`[city-master] ${message}`);
    process.exit(1);
}

/** Reads a CSV, gunzipping it first when it ends in .gz (the upstream release ships csv-cities.csv.gz). */
function readText(path: string): string {
    if (!fs.existsSync(path)) fail(`${path} not found`);
    const bytes = fs.readFileSync(path);
    return (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
}

function requireColumns(records: Record<string, string>[], file: string, columns: string[]): void {
    const missing = columns.filter((c) => records.length > 0 && !(c in records[0]));
    if (missing.length) fail(`${file} is missing column(s): ${missing.join(', ')}`);
}

function main(): void {
    const [citiesPath, statesPath] = process.argv.slice(2);
    if (!citiesPath) fail('usage: npm run build:city-master -- <cities.csv> [states.csv]');

    // ── Our subdivisions, per country ────────────────────────────────────────
    const workbook = XLSX.readFile(ADDRESS_WORKBOOK);
    const codesByCountry = new Map<string, Set<string>>();
    const codeByCountryAndName = new Map<string, string>();
    for (const row of XLSX.utils.sheet_to_json<SubdivisionRow>(workbook.Sheets.State_Region_Master, { defval: '' })) {
        const country = String(row.country_iso2).trim();
        const code = String(row.subdivision_code).trim();
        if (!country || !code) continue;
        if (!codesByCountry.has(country)) codesByCountry.set(country, new Set());
        codesByCountry.get(country)!.add(code);
        codeByCountryAndName.set(`${country}|${normalizePlaceName(String(row.subdivision_name))}`, code);
    }
    const countryCodes = new Set(
        XLSX.utils
            .sheet_to_json<{ iso2_code: string }>(workbook.Sheets.Country_Master, { defval: '' })
            .map((r) => String(r.iso2_code).trim())
            .filter((c) => /^[A-Z]{2}$/.test(c)),
    );

    // ── Optional states.csv → ISO 3166-2 code per upstream state id ──────────
    const isoByStateId = new Map<string, string>();
    if (statesPath) {
        const states = parseCsvRecords(readText(statesPath));
        requireColumns(states, 'states.csv', ['id']);
        if (states.length && 'iso3166_2' in states[0]) {
            for (const s of states) if (s.iso3166_2) isoByStateId.set(s.id, s.iso3166_2.toUpperCase());
        } else console.warn('[city-master] states.csv has no iso3166_2 column; matching by state code and name only');
    }

    // ── Cities ───────────────────────────────────────────────────────────────
    const cities = parseCsvRecords(readText(citiesPath));
    requireColumns(cities, 'cities.csv', ['name', 'state_id', 'state_code', 'state_name', 'country_code']);

    const out = new Map<string, CityMasterRow>();
    const unmatchedStates = new Map<string, number>();
    let droppedCountry = 0;
    let droppedType = 0;
    let byCode = 0;
    let byIso = 0;
    let byName = 0;

    for (const c of cities) {
        const country = c.country_code.toUpperCase();
        // ā → a like the subdivision names in the address master ('Haryana'); other accents stay.
        const cityName = c.name.replace(/ā/g, 'a').replace(/Ā/g, 'A').replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
        if (!cityName) continue;
        if (EXCLUDED_TYPES.has((c.type ?? '').toLowerCase()) || ADMIN_UNIT_NAME.test(cityName)) {
            droppedType++;
            continue;
        }
        if (!countryCodes.has(country)) {
            droppedCountry++;
            continue;
        }
        const codes = codesByCountry.get(country);
        let subdivisionCode = '';
        const direct = `${country}-${c.state_code.toUpperCase()}`;
        const iso = isoByStateId.get(c.state_id);
        if (c.state_code && codes?.has(direct)) {
            subdivisionCode = direct;
            byCode++;
        } else if (iso && codes?.has(iso)) {
            subdivisionCode = iso;
            byIso++;
        } else {
            const named = codeByCountryAndName.get(`${country}|${normalizePlaceName(c.state_name)}`);
            if (named) {
                subdivisionCode = named;
                byName++;
            } else if (c.state_name) {
                const key = `${country}: ${c.state_name} (${c.state_code})`;
                unmatchedStates.set(key, (unmatchedStates.get(key) ?? 0) + 1);
            }
        }
        // Upstream lists some places twice (e.g. as city and as district HQ); keep one per state, the larger one.
        const population = String(parsePopulation(c.population) ?? '');
        const key = `${country}|${subdivisionCode}|${normalizePlaceName(cityName)}`;
        const existing = out.get(key);
        if (!existing || Number(population) > Number(existing.population)) {
            out.set(key, { countryIso2: country, subdivisionCode, cityName, population });
        }
    }

    const rows = [...out.values()].sort(
        (a, b) =>
            a.countryIso2.localeCompare(b.countryIso2) ||
            a.subdivisionCode.localeCompare(b.subdivisionCode) ||
            a.cityName.localeCompare(b.cityName),
    );
    const csv = toCsv([CITY_MASTER_HEADER, ...rows.map((r) => [r.countryIso2, r.subdivisionCode, r.cityName, r.population])]);
    fs.writeFileSync(OUTPUT, gzipSync(csv, { level: 9 }));

    const unmatched = [...unmatchedStates.values()].reduce((a, b) => a + b, 0);
    console.log(`[city-master] read ${cities.length} cities → wrote ${rows.length} to ${OUTPUT}`);
    console.log(`[city-master] state matched by code ${byCode}, by iso3166_2 ${byIso}, by name ${byName}; unmatched ${unmatched}`);
    if (droppedType) console.log(`[city-master] dropped ${droppedType} regions / districts / abandoned places`);
    if (droppedCountry) console.log(`[city-master] dropped ${droppedCountry} cities of countries not in the address master`);
    if (unmatchedStates.size) {
        console.log(`[city-master] ${unmatchedStates.size} upstream states had no ISO match (cities kept, without a state). Largest:`);
        for (const [state, count] of [...unmatchedStates].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
            console.log(`    ${String(count).padStart(6)}  ${state}`);
        }
    }
}

main();
