/**
 * Database seed: `npm run seed` (or `npx prisma db seed`).
 *
 * Reference data (every run, idempotent):
 *   • admin user (SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD; a random password is generated and printed once
 *     when none is given); an existing admin's password is never changed
 *   • Nature of Call and partner masters (prisma/seed-data/masters.ts)
 *   • ISO 3166 address master (prisma/seed-data/CRM_Address_Master.xlsx): new countries / states added, names refreshed
 *   • city master (prisma/seed-data/cities.csv.gz, built by `npm run build:city-master`): only cities not loaded
 *     before are added; admin renames and removals are kept
 *   • address city links: records whose city has no City id yet are linked to it (see linkAddressCities)
 *
 * Demo data (skipped in production unless SEED_DEMO_DATA=true; only into an empty CRM):
 *   • directory users, products, organizations, contacts, leads, opportunities, quotations and tickets from
 *     prisma/seed-data/demo/*.json, created through the same record functions as the API (codes, validation,
 *     links and audit rows included). Demo users get SEED_USER_PASSWORD, or random passwords when unset.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { ENV } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { connectRedis, isRedisReady, redis } from '../src/config/redis.js';
import { createContactRecord } from '../src/modules/contacts/contact.service.js';
import { contactInputSchema } from '../src/modules/contacts/contact.validator.js';
import { createLeadRecord } from '../src/modules/leads/lead.service.js';
import { loadRatingConfig, newLeadRatingColumns, type RatingColumns } from '../src/modules/leads/lead.followUp.js';
import { businessToday } from '../src/validators/notInPast.js';
import { leadImportSchema } from '../src/modules/leads/lead.validator.js';
import { createOpportunityRecord } from '../src/modules/opportunities/opportunity.service.js';
import { opportunityInputSchema } from '../src/modules/opportunities/opportunity.validator.js';
import { createOrganizationRecord } from '../src/modules/organizations/organization.service.js';
import { organizationImportSchema } from '../src/modules/organizations/organization.validator.js';
import { createProductRecord } from '../src/modules/products/product.service.js';
import { productInputSchema } from '../src/modules/products/product.validator.js';
import { createQuotationRecord } from '../src/modules/quotations/quotation.service.js';
import { quotationInputSchema } from '../src/modules/quotations/quotation.validator.js';
import { linkAddressCities } from '../src/modules/cities/cityAddresses.js';
import { runInTransaction } from '../src/modules/shared/transactions.js';
import { createTicketRecord } from '../src/modules/tickets/ticket.service.js';
import { ticketInputSchema } from '../src/modules/tickets/ticket.validator.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { splitFullName } from '../src/modules/profile/profile.dto.js';
import { cacheService } from '../src/services/cache.service.js';
import type { AuthUser } from '../src/types/user.types.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { cityMasterSeedKey, normalizePlaceName, parseCsvRecords, parsePopulation } from '../src/utils/cityMaster.js';
import { parseStringArray, stringifyStringArray } from '../src/utils/mappers.js';
import {
    NATURE_OF_CALLS,
    ORGANIZATION_PRODUCT_COMPANIES,
    PARTNER_COMPANIES,
    PARTNER_CONTACTS,
    PRODUCT_COMPANIES,
} from './seed-data/masters.js';

XLSX.set_fs(fs);

const SEED_DIR = dirname(fileURLToPath(import.meta.url));
const ADDRESS_WORKBOOK = resolve(SEED_DIR, 'seed-data', 'CRM_Address_Master.xlsx');
const CITY_MASTER = resolve(SEED_DIR, 'seed-data', 'cities.csv.gz');
const DEMO_DATA_DIR = resolve(SEED_DIR, 'seed-data', 'demo');
/** SQL Server allows 2,100 parameters per statement; subdivisions have 4 columns. */
const INSERT_CHUNK = 400;

const log = (message: string) => console.log(`[seed] ${message}`);
const randomPassword = () => randomBytes(15).toString('base64url');

// ── Reference data ───────────────────────────────────────────────────────────

async function seedAdmin(): Promise<AuthUser> {
    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        log(`admin user "${username}" already exists (password unchanged)`);
        return { id: existing.id, username: existing.username, role: existing.role };
    }

    const provided = process.env.SEED_ADMIN_PASSWORD;
    if (provided && provided.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
    const password = provided || randomPassword();
    const admin = await prisma.user.create({
        data: { username, fullName: 'Administrator', ...splitFullName('Administrator'), role: 'Admin', department: 'Management', passwordHash: await hashPassword(password) },
    });
    log(`created admin user "${username}"`);
    if (!provided) log(`  generated password (shown once, store it now): ${password}`);
    return { id: admin.id, username: admin.username, role: admin.role };
}

async function seedMasters(): Promise<void> {
    for (const [index, entry] of NATURE_OF_CALLS.entries()) {
        await prisma.natureOfCall.upsert({
            where: { name: entry.name },
            create: { name: entry.name, priority: entry.priority, sortOrder: index },
            update: { priority: entry.priority, sortOrder: index },
        });
    }
    for (const company of [...PARTNER_COMPANIES, ...PRODUCT_COMPANIES]) {
        await prisma.partnerCompany.upsert({ where: { partnerName: company.partnerName }, create: company, update: company });
    }
    for (const { partnerCompany, ...contact } of PARTNER_CONTACTS) {
        const company = await prisma.partnerCompany.findUnique({ where: { partnerName: partnerCompany }, select: { id: true } });
        if (!company) continue;
        const existing = await prisma.partnerCompanyContact.findFirst({ where: { partnerCompanyId: company.id, name: contact.name }, select: { id: true } });
        if (existing) await prisma.partnerCompanyContact.update({ where: { id: existing.id }, data: contact });
        else await prisma.partnerCompanyContact.create({ data: { ...contact, partnerCompanyId: company.id } });
    }
    log(
        `masters: ${NATURE_OF_CALLS.length} natures of call, ${PARTNER_COMPANIES.length} partner companies, ` +
            `${PRODUCT_COMPANIES.length} product companies, ${PARTNER_CONTACTS.length} partner contacts`,
    );
}

/**
 * Links the product companies to organizations (Organization.partnerCompaniesJson, shown in the Partner Company
 * field / Partner Licensing tab). Merges by name and never removes partners, so it is idempotent and also
 * updates databases seeded before these companies existed. Runs after demo data so a fresh CRM is covered too.
 */
async function syncOrganizationProductCompanies(): Promise<void> {
    let updated = 0;
    for (const [organizationName, companies] of Object.entries(ORGANIZATION_PRODUCT_COMPANIES)) {
        const orgs = await prisma.organization.findMany({
            where: { organizationName, isDeleted: false },
            select: { id: true, partnerCompaniesJson: true },
        });
        for (const org of orgs) {
            const current = parseStringArray(org.partnerCompaniesJson);
            const missing = companies.filter((name) => !current.includes(name));
            if (missing.length === 0) continue;
            await prisma.organization.update({
                where: { id: org.id },
                data: { partnerCompaniesJson: stringifyStringArray([...current, ...missing]), updatedBy: 'system' },
            });
            updated++;
        }
    }
    log(`product companies: linked to ${updated} organization(s)`);
}

interface CountryRow { country_name: string; iso2_code: string; iso3_code: string; numeric_code: string | number }
interface SubdivisionRow { country_iso2: string; subdivision_code: string; subdivision_name: string; subdivision_type: string }

/** Loads the ISO address master; reloads only when the database doesn't match the workbook. */
async function seedAddressMaster(): Promise<void> {
    if (!fs.existsSync(ADDRESS_WORKBOOK)) {
        log(`address master skipped: ${ADDRESS_WORKBOOK} not found`);
        return;
    }
    const workbook = XLSX.readFile(ADDRESS_WORKBOOK);
    const countries = XLSX.utils
        .sheet_to_json<CountryRow>(workbook.Sheets.Country_Master, { defval: '' })
        .filter((row) => /^[A-Z]{2}$/.test(String(row.iso2_code).trim()))
        .map((row) => ({
            iso2Code: String(row.iso2_code).trim(),
            iso3Code: String(row.iso3_code).trim(),
            countryName: String(row.country_name).trim(),
            numericCode: Number(row.numeric_code) || 0,
        }));
    const countryCodes = new Set(countries.map((c) => c.iso2Code));
    const subdivisionsByCode = new Map<string, { subdivisionCode: string; countryIso2: string; subdivisionName: string; subdivisionType: string }>();
    for (const row of XLSX.utils.sheet_to_json<SubdivisionRow>(workbook.Sheets.State_Region_Master, { defval: '' })) {
        const code = String(row.subdivision_code).trim();
        const countryIso2 = String(row.country_iso2).trim();
        if (!code || !countryCodes.has(countryIso2)) continue;
        subdivisionsByCode.set(code, {
            subdivisionCode: code,
            countryIso2,
            // ā → a like the frontend's address master ('Haryana', not 'Haryāna'); other accents stay.
            subdivisionName: String(row.subdivision_name).trim().replace(/ā/g, 'a').replace(/Ā/g, 'A'),
            subdivisionType: String(row.subdivision_type).trim(),
        });
    }
    const subdivisions = [...subdivisionsByCode.values()];

    // Add-only (names refreshed): cities, and through them addresses, reference these rows, so none is ever deleted.
    const [existingCountries, existingSubdivisions] = await Promise.all([
        prisma.country.findMany({ select: { iso2Code: true, countryName: true } }),
        prisma.subdivision.findMany({ select: { subdivisionCode: true, subdivisionName: true } }),
    ]);
    const countryNames = new Map(existingCountries.map((c) => [c.iso2Code, c.countryName]));
    const subdivisionNames = new Map(existingSubdivisions.map((s) => [s.subdivisionCode, s.subdivisionName]));
    const newCountries = countries.filter((c) => !countryNames.has(c.iso2Code));
    const newSubdivisions = subdivisions.filter((s) => !subdivisionNames.has(s.subdivisionCode));
    const renamedCountries = countries.filter((c) => countryNames.has(c.iso2Code) && countryNames.get(c.iso2Code) !== c.countryName);
    const renamedSubdivisions = subdivisions.filter(
        (s) => subdivisionNames.has(s.subdivisionCode) && subdivisionNames.get(s.subdivisionCode) !== s.subdivisionName,
    );
    if (newCountries.length + newSubdivisions.length + renamedCountries.length + renamedSubdivisions.length === 0) {
        log(`address master up to date (${existingCountries.length} countries, ${existingSubdivisions.length} subdivisions)`);
        return;
    }

    await prisma.$transaction(
        async (tx) => {
            if (newCountries.length > 0) await tx.country.createMany({ data: newCountries });
            for (let i = 0; i < newSubdivisions.length; i += INSERT_CHUNK) {
                await tx.subdivision.createMany({ data: newSubdivisions.slice(i, i + INSERT_CHUNK) });
            }
            for (const c of renamedCountries) await tx.country.update({ where: { iso2Code: c.iso2Code }, data: { countryName: c.countryName } });
            for (const s of renamedSubdivisions) {
                await tx.subdivision.update({ where: { subdivisionCode: s.subdivisionCode }, data: { subdivisionName: s.subdivisionName } });
            }
        },
        { timeout: 120_000 },
    );
    log(
        `address master: added ${newCountries.length} countries and ${newSubdivisions.length} subdivisions, ` +
            `renamed ${renamedCountries.length + renamedSubdivisions.length}`,
    );
}

/** SQL Server allows 2,100 parameters per statement; cities have 6 columns. */
const CITY_INSERT_CHUNK = 300;

/**
 * Adds the city-master rows the database hasn't loaded yet, matched by `seedKey`. Never deletes, renames or
 * re-shows a city: addresses reference them, and admins rename and remove cities (a removed seeded city stays as a
 * hidden row so it isn't added again). Run after seedAddressMaster.
 */
async function seedCityMaster(): Promise<void> {
    if (!fs.existsSync(CITY_MASTER)) {
        log(`city master skipped: ${CITY_MASTER} not found (build it with npm run build:city-master)`);
        return;
    }
    const [countryCodes, subdivisionCodes, loadedKeys] = await Promise.all([
        prisma.country.findMany({ select: { iso2Code: true } }).then((rows) => new Set(rows.map((r) => r.iso2Code))),
        prisma.subdivision.findMany({ select: { subdivisionCode: true } }).then((rows) => new Set(rows.map((r) => r.subdivisionCode))),
        prisma.city
            .findMany({ where: { seedKey: { not: null } }, select: { seedKey: true } })
            .then((rows) => new Set(rows.map((r) => r.seedKey as string))),
    ]);

    const seen = new Set<string>();
    const missing: Prisma.CityCreateManyInput[] = [];
    for (const row of parseCsvRecords(gunzipSync(fs.readFileSync(CITY_MASTER)).toString('utf8'))) {
        if (!countryCodes.has(row.country_iso2) || !row.city_name) continue;
        // A code the address workbook doesn't have: keep the city, findable by country.
        const subdivisionCode = subdivisionCodes.has(row.subdivision_code) ? row.subdivision_code : null;
        const searchName = normalizePlaceName(row.city_name).slice(0, 150);
        const seedKey = cityMasterSeedKey(row.country_iso2, subdivisionCode, searchName);
        // The same name twice in one state would be two identical dropdown entries: keep the first (biggest).
        if (seen.has(seedKey)) continue;
        seen.add(seedKey);
        if (loadedKeys.has(seedKey)) continue;
        missing.push({
            seedKey,
            countryIso2: row.country_iso2,
            subdivisionCode,
            cityName: row.city_name,
            searchName,
            population: parsePopulation(row.population),
        });
    }
    if (missing.length === 0) {
        log(`city master up to date (${loadedKeys.size} seeded cities)`);
        return;
    }

    // One transaction so the API never serves a half-loaded list.
    await prisma.$transaction(
        async (tx) => {
            for (let i = 0; i < missing.length; i += CITY_INSERT_CHUNK) {
                await tx.city.createMany({ data: missing.slice(i, i + CITY_INSERT_CHUNK) });
            }
        },
        { timeout: 600_000, maxWait: 10_000 },
    );
    log(`city master: added ${missing.length} cities`);
}

// ── Demo data ────────────────────────────────────────────────────────────────

type MockRecord = Record<string, any>;

type DemoDataset = 'users' | 'products' | 'organizations' | 'contacts' | 'leads' | 'opportunities' | 'quotations' | 'tickets';

async function loadMock(dataset: DemoDataset): Promise<MockRecord[]> {
    const records: unknown = JSON.parse(await fs.promises.readFile(resolve(DEMO_DATA_DIR, `${dataset}.json`), 'utf8'));
    if (!Array.isArray(records)) throw new Error(`seed-data/demo/${dataset}.json is not an array`);
    return records as MockRecord[];
}

interface Tally {
    created: number;
    skipped: string[];
}

/** Runs one demo record write; a record that fails validation or a uniqueness rule is reported and skipped. */
async function attempt<T>(tally: Tally, label: string, write: () => Promise<T>): Promise<T | undefined> {
    try {
        const result = await write();
        tally.created++;
        return result;
    } catch (err) {
        const issues = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
        const reason = issues ? issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message;
        tally.skipped.push(`${label} — ${reason}`);
        return undefined;
    }
}

function report(entity: string, tally: Tally): void {
    log(`${entity}: ${tally.created} created${tally.skipped.length ? `, ${tally.skipped.length} skipped` : ''}`);
    for (const reason of tally.skipped) log(`  skipped ${reason}`);
}

const remap = (map: Map<string, string>, id: unknown) => (typeof id === 'string' && map.get(id)) || undefined;

async function seedDemoUsers(): Promise<void> {
    const users = await loadMock('users');
    const sharedPassword = process.env.SEED_USER_PASSWORD;
    let created = 0;
    for (const user of users) {
        if (await prisma.user.findUnique({ where: { username: user.username } })) continue;
        await prisma.user.create({
            data: {
                username: user.username,
                fullName: user.name,
                ...splitFullName(user.name),
                email: user.email || null,
                role: user.role,
                department: user.department,
                isActive: user.status !== 'Inactive',
                isGroupUser: Boolean(user.isGroupUser),
                onLeave: Boolean(user.onLeave),
                passwordHash: await hashPassword(sharedPassword || randomPassword()),
            },
        });
        created++;
    }
    log(`demo users: ${created} created${sharedPassword ? ' (password: SEED_USER_PASSWORD)' : ' (random passwords; set SEED_USER_PASSWORD to sign in as them)'}`);
}

async function seedDemoRecords(admin: AuthUser): Promise<void> {
    const actorFor = (record: MockRecord): AuthUser => ({ ...admin, username: record.createdBy || admin.username });
    const productIds = new Map<string, string>();
    const organizationIds = new Map<string, string>();
    const contactIds = new Map<string, string>();
    const opportunityIds = new Map<string, string>();

    const products: Tally = { created: 0, skipped: [] };
    for (const p of await loadMock('products')) {
        const dto = await attempt(products, p.productName, () =>
            runInTransaction((tx) => createProductRecord(tx, productInputSchema.parse(p), actorFor(p))),
        );
        if (dto) productIds.set(p.id, dto.id);
    }
    report('products', products);

    // Parents first, so "Member of" links resolve.
    const organizations: Tally = { created: 0, skipped: [] };
    const orgMocks = (await loadMock('organizations')).sort(
        (a, b) => Number(Boolean(a.memberOf)) - Number(Boolean(b.memberOf)),
    );
    for (const o of orgMocks) {
        const dto = await attempt(organizations, o.organizationName, () =>
            runInTransaction((tx) => createOrganizationRecord(tx, organizationImportSchema.parse(o), actorFor(o))),
        );
        if (dto) organizationIds.set(o.id, dto.id);
    }
    report('organizations', organizations);

    const contacts: Tally = { created: 0, skipped: [] };
    for (const c of await loadMock('contacts')) {
        const dto = await attempt(contacts, c.name, () =>
            runInTransaction((tx) =>
                createContactRecord(tx, contactInputSchema.parse({ ...c, organizationId: remap(organizationIds, c.organizationId) }), actorFor(c)),
            ),
        );
        if (dto) contactIds.set(c.id, dto.id);
    }
    report('contacts', contacts);

    const leads: Tally = { created: 0, skipped: [] };
    const ratingConfig = await loadRatingConfig(prisma);
    for (const l of await loadMock('leads')) {
        await attempt(leads, l.name, () =>
            runInTransaction((tx) => {
                const input = leadImportSchema.parse(l);
                // Rated by the new-lead rule, unless the demo data presets a Rating.
                const rating = newLeadRatingColumns(ratingConfig, businessToday(), input.nextFollowupDate);
                const preset = typeof l.rating === 'string' && l.rating ? { rating: l.rating, ratingReason: 'Demo data' } : {};
                return createLeadRecord(tx, input, actorFor(l), { ...rating, ...preset } as RatingColumns);
            }),
        );
    }
    report('leads', leads);

    const withProducts = (items: MockRecord[] | undefined) =>
        (items ?? []).map((item) => ({ ...item, productId: remap(productIds, item.productId) }));

    const opportunities: Tally = { created: 0, skipped: [] };
    for (const o of await loadMock('opportunities')) {
        const input = {
            ...o,
            organizationId: remap(organizationIds, o.organizationId),
            contactId: remap(contactIds, o.contactId),
            lineItems: withProducts(o.lineItems),
        };
        const dto = await attempt(opportunities, o.opportunityCode ?? o.opportunityName, () =>
            runInTransaction((tx) => createOpportunityRecord(tx, opportunityInputSchema.parse(input), actorFor(o))),
        );
        if (dto) opportunityIds.set(o.id, dto.id);
    }
    report('opportunities', opportunities);

    const quotations: Tally = { created: 0, skipped: [] };
    for (const q of await loadMock('quotations')) {
        const input = {
            ...q,
            opportunityId: remap(opportunityIds, q.opportunityId),
            organizationId: remap(organizationIds, q.organizationId),
            contactId: remap(contactIds, q.contactId),
            lineItems: withProducts(q.lineItems),
        };
        await attempt(quotations, q.quotationCode ?? q.quotationTitle, () =>
            runInTransaction((tx) => createQuotationRecord(tx, quotationInputSchema.parse(input), actorFor(q))),
        );
    }
    report('quotations', quotations);

    const tickets: Tally = { created: 0, skipped: [] };
    for (const t of await loadMock('tickets')) {
        await attempt(tickets, t.ticketNumber ?? t.ticketSubject, () =>
            runInTransaction((tx) => createTicketRecord(tx, ticketInputSchema.parse(t), actorFor(t))),
        );
    }
    report('tickets', tickets);
}

async function crmIsEmpty(): Promise<boolean> {
    const counts = await Promise.all([
        prisma.organization.count(),
        prisma.contact.count(),
        prisma.lead.count(),
        prisma.opportunity.count(),
        prisma.quotation.count(),
        prisma.product.count(),
        prisma.ticket.count(),
    ]);
    return counts.every((count) => count === 0);
}

async function seedDemoData(admin: AuthUser): Promise<void> {
    const wanted = process.env.SEED_DEMO_DATA ? process.env.SEED_DEMO_DATA === 'true' : !ENV.IS_PRODUCTION;
    if (!wanted) {
        log(`demo data skipped (${process.env.SEED_DEMO_DATA ? 'SEED_DEMO_DATA=false' : 'production'}; set SEED_DEMO_DATA=true to include it)`);
        return;
    }
    await seedDemoUsers();
    if (!(await crmIsEmpty())) {
        log('demo records skipped: the CRM already has records');
        return;
    }
    await seedDemoRecords(admin);
}

/** Best effort: drop cached lookups / search so the API sees the new data immediately. */
async function invalidateCaches(): Promise<void> {
    connectRedis();
    for (let waited = 0; !isRedisReady() && waited < 2_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    if (!isRedisReady()) return;
    await Promise.all([cacheService.invalidatePattern('cache:*'), cacheService.invalidatePattern('recent:*')]);
    log('caches cleared');
}

async function main(): Promise<void> {
    const admin = await seedAdmin();
    await seedMasters();
    await seedAddressMaster();
    await seedCityMaster();
    await seedDemoData(admin);
    await syncOrganizationProductCompanies();
    // Partner masters are written straight to the table, and older databases have city names without ids.
    const cityLinks = await linkAddressCities();
    log(`address cities: linked ${cityLinks.linked}, ${cityLinks.unmatched} not in the city list (left as they are)`);
    await invalidateCaches();
    log('done');
}

main()
    .catch((err: Error) => {
        console.error('[seed] failed:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        // disconnect(), not quit(): with Redis unreachable the client is mid-reconnect, quit() never settles,
        // and its retry timers would keep the process alive.
        redis.disconnect();
        await prisma.$disconnect();
    });
