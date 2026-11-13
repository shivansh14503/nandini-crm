import { prisma, type TransactionClient } from '../../config/prisma.js';
import { ENV } from '../../config/env.js';
import { auditService, diffRecords } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { runInTransaction } from '../shared/transactions.js';
import {
    counterKey,
    DEFAULT_SETTINGS,
    financialYearOf,
    formatDocumentNumber,
    LEGACY_SETTINGS,
    legacyRule,
    nextNumber,
    MAX_CODE_LENGTH,
    SERIES_MODULE_LABELS,
    SERIES_MODULES,
    SUGGESTED_PREFIX,
    type FinancialYear,
    type FyFormat,
    type SeriesModule,
    type SeriesRule,
    type SeriesSettings,
    type Separator,
} from './documentSeries.format.js';
import { saveDocumentSeriesSchema } from './documentSeries.validator.js';

const SETTINGS_ID = 1;
/** Numbers already taken (imported or created under an older format) are skipped; this bounds the search. */
const MAX_COLLISION_SKIPS = 1000;

type Db = TransactionClient | typeof prisma;

/** An admin-added series. */
export interface DocumentSeriesDto extends SeriesRule {
    module: SeriesModule;
    label: string;
    /** Last number issued in the current financial year (0 = none yet). */
    lastNumber: number;
    /** What the next record will get, e.g. `NIPL/L/26-27/1004`. */
    nextCode: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

/** A module without a series: it keeps its original numbering. */
export interface DefaultNumberingDto {
    module: SeriesModule;
    label: string;
    /** Next number under the original numbering, e.g. `LD-0013`. */
    nextCode: string;
    /** Prefix offered when the admin adds a series for it. */
    suggestedPrefix: string;
    /** Last number issued in the current financial year if a series is added now (0 = none yet). */
    seriesLastNumber: number;
}

export interface DocumentSeriesConfigDto {
    settings: SeriesSettings & { updatedBy: string | null; updatedAt: string | null };
    currentFinancialYear: FinancialYear;
    timeZone: string;
    series: DocumentSeriesDto[];
    defaultNumbering: DefaultNumberingDto[];
}

type Rules = Partial<Record<SeriesModule, SeriesRule>>;

interface LoadedConfig {
    settings: SeriesSettings;
    /** Admin-added series only. */
    rules: Rules;
    meta: {
        settings: { updatedBy: string | null; updatedAt: Date | null };
        series: Partial<Record<SeriesModule, { updatedBy: string | null; updatedAt: Date }>>;
    };
}

function toSettings(row: { companyPrefix: string; separator: string; fyStartMonth: number; fyFormat: string } | null): SeriesSettings {
    if (!row) return { ...DEFAULT_SETTINGS };
    return { companyPrefix: row.companyPrefix, separator: row.separator as Separator, fyStartMonth: row.fyStartMonth, fyFormat: row.fyFormat as FyFormat };
}

/** Admin-added series always carry the financial year and restart every year. */
function seriesRule(row: Pick<SeriesRule, 'modulePrefix' | 'includeCompanyPrefix' | 'suffix' | 'padLength' | 'startingNumber'>): SeriesRule {
    return {
        modulePrefix: row.modulePrefix,
        includeCompanyPrefix: row.includeCompanyPrefix,
        includeFinancialYear: true,
        suffix: row.suffix,
        padLength: row.padLength,
        startingNumber: row.startingNumber,
        resetEachFinancialYear: true,
    };
}

const isSeriesModule = (value: string): value is SeriesModule => (SERIES_MODULES as readonly string[]).includes(value);

async function loadConfig(db: Db): Promise<LoadedConfig> {
    const [settingsRow, seriesRows] = await Promise.all([
        db.documentSeriesSettings.findUnique({ where: { id: SETTINGS_ID } }),
        db.documentSeries.findMany(),
    ]);
    const rules: Rules = {};
    const seriesMeta: LoadedConfig['meta']['series'] = {};
    for (const row of seriesRows) {
        if (!isSeriesModule(row.module)) continue;
        rules[row.module] = seriesRule(row);
        seriesMeta[row.module] = { updatedBy: row.updatedBy, updatedAt: row.updatedAt };
    }
    return {
        settings: toSettings(settingsRow),
        rules,
        meta: { settings: { updatedBy: settingsRow?.updatedBy ?? null, updatedAt: settingsRow?.updatedAt ?? null }, series: seriesMeta },
    };
}

/** Settings + rule a module's numbers are built with: its series, or the original numbering when it has none. */
function effectiveFormat(config: Pick<LoadedConfig, 'settings' | 'rules'>, module: SeriesModule): { settings: SeriesSettings; rule: SeriesRule } {
    const rule = config.rules[module];
    return rule ? { settings: config.settings, rule } : { settings: LEGACY_SETTINGS, rule: legacyRule(module) };
}

/** Whether a record already holds `code` (deleted records included: the unique keys cover them too). */
async function codeTaken(tx: TransactionClient, module: SeriesModule, code: string): Promise<boolean> {
    switch (module) {
        case 'lead':
            return (await tx.lead.count({ where: { leadCode: code } })) > 0;
        case 'opportunity':
            return (await tx.opportunity.count({ where: { opportunityCode: code } })) > 0;
        case 'quotation':
            return (await tx.quotation.count({ where: { quotationCode: code } })) > 0;
        case 'organization':
            return (await tx.organization.count({ where: { accountCode: code } })) > 0;
        case 'contact':
            return (await tx.contact.count({ where: { contactCode: code } })) > 0;
        case 'ticket':
            return (await tx.ticket.count({ where: { ticketNumber: code } })) > 0;
        case 'product':
            return (await tx.product.count({ where: { productCode: code } })) > 0;
    }
}

/**
 * Atomically takes the next number of a counter: the stored value + 1, or `startingNumber` when that is higher
 * (a brand-new counter, or an admin moving the series forward). Runs as a single MERGE under HOLDLOCK, so
 * concurrent creates serialize on the counter row and never get the same number, even on the very first call.
 * Called inside the transaction that inserts the record, so a rolled-back insert releases its number.
 */
async function takeNextNumber(tx: TransactionClient, key: string, startingNumber: number): Promise<number> {
    const rows = await tx.$queryRaw<{ currentValue: number }[]>`
        MERGE [dbo].[SequenceCounter] WITH (HOLDLOCK) AS target
        USING (SELECT ${key} AS prefix) AS source
            ON target.[prefix] = source.[prefix]
        WHEN MATCHED THEN
            UPDATE SET [currentValue] = CASE WHEN target.[currentValue] + 1 < ${startingNumber} THEN ${startingNumber} ELSE target.[currentValue] + 1 END
        WHEN NOT MATCHED THEN
            INSERT ([prefix], [currentValue]) VALUES (source.[prefix], ${startingNumber})
        OUTPUT inserted.[currentValue] AS currentValue;
    `;
    const value = rows[0]?.currentValue;
    if (typeof value !== 'number') throw new Error(`Failed to take a number from counter "${key}"`);
    return value;
}

/**
 * The next document number of `module`: from its series (e.g. `NIPL/L/26-27/1004`, restarting every financial
 * year on its own counter) or, for a module without one, its original numbering (`LD-0013`).
 * Call it first inside the transaction that inserts the record.
 */
export async function generateDocumentCode(tx: TransactionClient, module: SeriesModule, now = new Date()): Promise<string> {
    const config = await loadConfig(tx);
    const { settings, rule } = effectiveFormat(config, module);
    const fy = financialYearOf(now, config.settings, ENV.BUSINESS_TIMEZONE);
    const key = counterKey(module, rule, fy);

    for (let attempt = 0; attempt <= MAX_COLLISION_SKIPS; attempt++) {
        const value = await takeNextNumber(tx, key, rule.startingNumber);
        const code = formatDocumentNumber(settings, rule, fy, value);
        if (code.length > MAX_CODE_LENGTH) {
            throw new Error(`Generated ${module} number "${code}" exceeds ${MAX_CODE_LENGTH} characters`);
        }
        // A number can already exist (imported, or issued under an older format); skip it instead of failing.
        if (!(await codeTaken(tx, module, code))) return code;
    }
    throw HttpError.conflict(
        `Could not find a free ${SERIES_MODULE_LABELS[module].toLowerCase()} number. Ask an administrator to raise the starting number in Document Series.`,
    );
}

async function buildConfigDto(db: Db, now = new Date()): Promise<DocumentSeriesConfigDto> {
    const config = await loadConfig(db);
    const { settings, rules, meta } = config;
    const fy = financialYearOf(now, settings, ENV.BUSINESS_TIMEZONE);
    const seriesKey = (module: SeriesModule) => counterKey(module, { resetEachFinancialYear: true }, fy);
    const legacyKey = (module: SeriesModule) => counterKey(module, { resetEachFinancialYear: false }, fy);
    const counters = await db.sequenceCounter.findMany({ where: { prefix: { in: SERIES_MODULES.flatMap((m) => [seriesKey(m), legacyKey(m)]) } } });
    const last = new Map(counters.map((counter) => [counter.prefix, counter.currentValue]));

    const series: DocumentSeriesDto[] = [];
    const defaultNumbering: DefaultNumberingDto[] = [];
    for (const module of SERIES_MODULES) {
        const rule = rules[module];
        const seriesLast = last.get(seriesKey(module)) ?? 0;
        if (rule) {
            series.push({
                module,
                label: SERIES_MODULE_LABELS[module],
                ...rule,
                lastNumber: seriesLast,
                nextCode: formatDocumentNumber(settings, rule, fy, nextNumber(seriesLast, rule.startingNumber)),
                updatedBy: meta.series[module]?.updatedBy ?? null,
                updatedAt: meta.series[module]?.updatedAt.toISOString() ?? null,
            });
        } else {
            const legacy = legacyRule(module);
            defaultNumbering.push({
                module,
                label: SERIES_MODULE_LABELS[module],
                nextCode: formatDocumentNumber(LEGACY_SETTINGS, legacy, fy, nextNumber(last.get(legacyKey(module)) ?? 0, legacy.startingNumber)),
                suggestedPrefix: SUGGESTED_PREFIX[module],
                seriesLastNumber: seriesLast,
            });
        }
    }

    return {
        settings: { ...settings, updatedBy: meta.settings.updatedBy, updatedAt: meta.settings.updatedAt?.toISOString() ?? null },
        currentFinancialYear: fy,
        timeZone: ENV.BUSINESS_TIMEZONE,
        series,
        defaultNumbering,
    };
}

export const documentSeriesService = {
    getConfig(): Promise<DocumentSeriesConfigDto> {
        return buildConfigDto(prisma);
    },

    /** Saves the common settings and the full list of series; modules left out go back to their original numbering. */
    async saveConfig(body: unknown, user: AuthUser): Promise<DocumentSeriesConfigDto> {
        const input = saveDocumentSeriesSchema.parse(body);

        return runInTransaction(async (tx) => {
            const before = await loadConfig(tx);
            const settings: SeriesSettings = {
                companyPrefix: input.companyPrefix,
                separator: input.separator,
                fyStartMonth: input.fyStartMonth,
                fyFormat: input.fyFormat,
            };
            const rules: Rules = Object.fromEntries(input.series.map(({ module, ...rule }) => [module, seriesRule(rule)]));

            await tx.documentSeriesSettings.upsert({
                where: { id: SETTINGS_ID },
                create: { id: SETTINGS_ID, ...settings, updatedBy: user.username },
                update: { ...settings, updatedBy: user.username },
            });
            await tx.documentSeries.deleteMany({ where: { module: { notIn: input.series.map((s) => s.module) } } });
            for (const { module, ...rest } of input.series) {
                const rule = seriesRule(rest);
                await tx.documentSeries.upsert({
                    where: { module },
                    create: { module, ...rule, updatedBy: user.username },
                    update: { ...rule, updatedBy: user.username },
                });
            }

            const changes = diffRecords({ ...before.settings, ...before.rules }, { ...settings, ...rules });
            if (Object.keys(changes).length > 0) {
                await auditService.record(tx, { entityType: 'DocumentSeries', entityId: 'document-series', action: 'UPDATE', changedBy: user.username, changes });
            }
            return buildConfigDto(tx);
        });
    },
};
