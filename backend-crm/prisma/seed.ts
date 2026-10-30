/**
 * Database seed: `npm run seed` (or `npx prisma db seed`).
 *
 * Reference data (every run, idempotent):
 *   • admin user (SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD; a random password is generated and printed once
 *     when none is given); an existing admin's password is never changed
 *   • Nature of Call and partner masters (prisma/seed-data/masters.ts)
 *   • ISO 3166 address master (prisma/seed-data/CRM_Address_Master.xlsx), refreshed when the workbook changes
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
import * as XLSX from 'xlsx';
import { ENV } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { connectRedis, isRedisReady, redis } from '../src/config/redis.js';
import { createContactRecord } from '../src/modules/contacts/contact.service.js';
import { contactInputSchema } from '../src/modules/contacts/contact.validator.js';
import { createLeadRecord } from '../src/modules/leads/lead.service.js';
import { leadImportSchema } from '../src/modules/leads/lead.validator.js';
import { createOpportunityRecord } from '../src/modules/opportunities/opportunity.service.js';
import { opportunityInputSchema } from '../src/modules/opportunities/opportunity.validator.js';
import { createOrganizationRecord } from '../src/modules/organizations/organization.service.js';
import { organizationImportSchema } from '../src/modules/organizations/organization.validator.js';
import { createProductRecord } from '../src/modules/products/product.service.js';
import { productInputSchema } from '../src/modules/products/product.validator.js';
import { createQuotationRecord } from '../src/modules/quotations/quotation.service.js';
import { quotationInputSchema } from '../src/modules/quotations/quotation.validator.js';
import { runInTransaction } from '../src/modules/shared/transactions.js';
import { createTicketRecord } from '../src/modules/tickets/ticket.service.js';
import { ticketInputSchema } from '../src/modules/tickets/ticket.validator.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { cacheService } from '../src/services/cache.service.js';
import type { AuthUser } from '../src/types/user.types.js';
import { NATURE_OF_CALLS, PARTNER_COMPANIES, PARTNER_CONTACTS } from './seed-data/masters.js';

XLSX.set_fs(fs);

const SEED_DIR = dirname(fileURLToPath(import.meta.url));
const ADDRESS_WORKBOOK = resolve(SEED_DIR, 'seed-data', 'CRM_Address_Master.xlsx');
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
        data: { username, fullName: 'Administrator', role: 'Admin', department: 'Management', passwordHash: await hashPassword(password) },
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
    for (const company of PARTNER_COMPANIES) {
        await prisma.partnerCompany.upsert({ where: { companyName: company.companyName }, create: company, update: company });
    }
    for (const { partnerCompany, ...contact } of PARTNER_CONTACTS) {
        const company = await prisma.partnerCompany.findUnique({ where: { companyName: partnerCompany }, select: { id: true } });
        if (!company) continue;
        const existing = await prisma.partnerCompanyContact.findFirst({ where: { partnerCompanyId: company.id, name: contact.name }, select: { id: true } });
        if (existing) await prisma.partnerCompanyContact.update({ where: { id: existing.id }, data: contact });
        else await prisma.partnerCompanyContact.create({ data: { ...contact, partnerCompanyId: company.id } });
    }
    log(`masters: ${NATURE_OF_CALLS.length} natures of call, ${PARTNER_COMPANIES.length} partner companies, ${PARTNER_CONTACTS.length} partner contacts`);
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
            subdivisionName: String(row.subdivision_name).trim(),
            subdivisionType: String(row.subdivision_type).trim(),
        });
    }
    const subdivisions = [...subdivisionsByCode.values()];

    const [countryCount, subdivisionCount] = await Promise.all([prisma.country.count(), prisma.subdivision.count()]);
    if (countryCount === countries.length && subdivisionCount === subdivisions.length && process.env.SEED_REFRESH_ADDRESS_MASTER !== 'true') {
        log(`address master up to date (${countryCount} countries, ${subdivisionCount} subdivisions)`);
        return;
    }

    // Nothing references these tables by foreign key (addresses store ISO2 codes), so a full reload is safe.
    await prisma.$transaction(
        async (tx) => {
            await tx.subdivision.deleteMany();
            await tx.country.deleteMany();
            await tx.country.createMany({ data: countries });
            for (let i = 0; i < subdivisions.length; i += INSERT_CHUNK) {
                await tx.subdivision.createMany({ data: subdivisions.slice(i, i + INSERT_CHUNK) });
            }
        },
        { timeout: 120_000 },
    );
    log(`address master loaded: ${countries.length} countries, ${subdivisions.length} subdivisions`);
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
        (a, b) => Number(Boolean(a.memberOfParentCorp)) - Number(Boolean(b.memberOfParentCorp)),
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
    for (const l of await loadMock('leads')) {
        await attempt(leads, l.name, () => runInTransaction((tx) => createLeadRecord(tx, leadImportSchema.parse(l), actorFor(l))));
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
    await seedDemoData(admin);
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
