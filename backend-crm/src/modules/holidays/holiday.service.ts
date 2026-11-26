import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { prisma, type TransactionClient } from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditService, diffRecords, type AuditEntry } from '../../services/audit.service.js';
import { currentAuditOrigin, runWithAuditOrigin } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { fromDateOnly, toDateOnly } from '../../utils/mappers.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { runInTransaction } from '../shared/transactions.js';
import {
    holidayInputSchema,
    holidayKey,
    parseImportDate,
    parseImportMonthDay,
    readYesNo,
    yearlyDateIn,
    YEARLY_ANCHOR_YEAR,
    type HolidayBulkAction,
    type HolidayImportBody,
    type HolidayInput,
    type HolidayListQuery,
} from './holiday.validator.js';

export interface HolidayDto {
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`; `MM-DD` when the holiday repeats every year. */
    holidayDate: string;
    repeatsYearly: boolean;
    status: string;
    createdBy: string;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface HolidayListResult {
    data: HolidayDto[];
    total: number;
    page: number;
    limit: number;
    /** Years from the earliest to the latest holiday (and the current one), newest first, for the year filter. */
    years: number[];
}

/** One active holiday on one day, as the calendar and the activity forms read it. */
export interface CalendarHoliday {
    /** The holiday's id; for a yearly holiday `<id>@<year>`, so each year's day has its own key. */
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`: the day it falls on. */
    holidayDate: string;
    repeatsYearly: boolean;
}

export type HolidayImportOutcome = 'new' | 'duplicate' | 'error';

export interface HolidayImportRowResult {
    rowNumber: number;
    outcome: HolidayImportOutcome;
    /** The row as it would be saved (blank when it couldn't be read). */
    occasion: string;
    holidayDate: string;
    repeatsYearly: boolean;
    status: string;
    /** Why a row is an error, or which holiday it duplicates. */
    messages: string[];
}

export interface HolidayImportResult {
    dryRun: boolean;
    total: number;
    /** Rows that are (or, in a dry run, would be) added. */
    created: number;
    duplicates: number;
    failed: number;
    rows: HolidayImportRowResult[];
}

type HolidayRow = Prisma.HolidayGetPayload<object>;

const DUPLICATE_CODE = 'DUPLICATE_HOLIDAY';
const CREATE_CHUNK = 200;

/** The date the API shows: `YYYY-MM-DD`, or `MM-DD` for a yearly holiday (its stored year means nothing). */
const shownDate = (row: Pick<HolidayRow, 'holidayDate' | 'repeatsYearly'>) => (row.repeatsYearly ? toDateOnly(row.holidayDate).slice(5) : toDateOnly(row.holidayDate));

/** The column value: a yearly holiday is stored on its day and month in YEARLY_ANCHOR_YEAR. */
const storedDate = (input: Pick<HolidayInput, 'holidayDate' | 'repeatsYearly'>) =>
    fromDateOnly(input.repeatsYearly ? `${YEARLY_ANCHOR_YEAR}-${input.holidayDate}` : input.holidayDate);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `08-15` → `15 Aug`. */
const monthDayLabel = (monthDay: string) => `${Number(monthDay.slice(3, 5))} ${MONTH_NAMES[Number(monthDay.slice(0, 2)) - 1]}`;

export const toHolidayDto = (row: HolidayRow): HolidayDto => ({
    id: row.id,
    occasion: row.occasion,
    holidayDate: shownDate(row),
    repeatsYearly: row.repeatsYearly,
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

/** What the audit log keeps of a holiday (no bookkeeping columns). */
const auditSnapshot = (dto: HolidayDto) => ({ occasion: dto.occasion, holidayDate: dto.holidayDate, repeatsYearly: dto.repeatsYearly, status: dto.status });

const duplicateError = (input: Pick<HolidayInput, 'occasion' | 'holidayDate' | 'repeatsYearly'>, coveredByYearly = false) => {
    const yearly = input.repeatsYearly || coveredByYearly;
    const message = yearly ? 'This occasion already repeats every year on this day.' : 'This occasion is already a holiday on this date.';
    const when = yearly ? `every year on ${monthDayLabel(input.holidayDate.slice(-5))}` : `on ${input.holidayDate}`;
    return new HttpError(`"${input.occasion}" is already a holiday ${when}.`, StatusCodes.CONFLICT, {
        code: DUPLICATE_CODE,
        errors: [{ message, path: ['occasion'] }],
    });
};

/**
 * Rejects a holiday that already exists (the database compares occasions without letter case): the same one-off date,
 * the same yearly day, or a one-off date that a yearly holiday of that occasion already covers. A yearly holiday may
 * still be added while one-off copies of it exist; the calendar shows such a day once.
 */
async function assertNotDuplicate(tx: TransactionClient, input: HolidayInput, exceptId?: string): Promise<void> {
    const except = exceptId ? { id: { not: exceptId } } : {};
    const clash = await tx.holiday.findFirst({ where: { holidayDate: storedDate(input), occasion: input.occasion, ...except }, select: { id: true } });
    if (clash) throw duplicateError(input);
    if (!input.repeatsYearly) {
        const yearly = await tx.holiday.findFirst({
            where: { repeatsYearly: true, holidayDate: storedDate({ holidayDate: input.holidayDate.slice(5), repeatsYearly: true }), occasion: input.occasion, ...except },
            select: { id: true },
        });
        if (yearly) throw duplicateError(input, true);
    }
}

/** Runs a write, turning a unique-index refusal (two admins adding the same holiday at once) into the 409 above. */
async function guardDuplicate<T>(input: HolidayInput, fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        if (isUniqueViolation(err)) throw duplicateError(input);
        throw err;
    }
}

const yearRange = (year: number) => ({ gte: fromDateOnly(`${year}-01-01`), lt: fromDateOnly(`${year + 1}-01-01`) });

export function listWhere(query: Pick<HolidayListQuery, 'search' | 'year' | 'status'>): Prisma.HolidayWhereInput {
    const and: Prisma.HolidayWhereInput[] = [];
    // A yearly holiday falls in every year.
    if (query.year) and.push({ OR: [{ holidayDate: yearRange(query.year) }, { repeatsYearly: true }] });
    if (query.status) and.push({ status: query.status });
    if (query.search) and.push({ occasion: { contains: query.search } });
    return and.length ? { AND: and } : {};
}

/** Years from the earliest to the latest holiday, plus the current year, newest first. */
export function yearsBetween(min: Date | null, max: Date | null, currentYear: number): number[] {
    const first = Math.min(min ? min.getUTCFullYear() : currentYear, currentYear);
    const last = Math.max(max ? max.getUTCFullYear() : currentYear, currentYear);
    const years: number[] = [];
    for (let year = last; year >= first; year--) years.push(year);
    return years;
}

/** The date and the Repeats Every Year flag an imported row asks for, or the reason it can't be read. */
function readImportDay(values: HolidayImportBody['rows'][number]['values']): { holidayDate: string; repeatsYearly: boolean } | { message: string } {
    const raw = values.holidayDate ?? '';
    const repeats = readYesNo(values.repeatsYearly);
    if (repeats !== undefined && typeof repeats !== 'boolean') return { message: 'Repeats Every Year must be Yes or No.' };
    if (!raw) return { message: 'Holiday Date is required.' };
    const full = parseImportDate(raw);
    const monthDay = full ? full.slice(5) : parseImportMonthDay(raw);
    if (!monthDay) return { message: `Holiday Date "${raw}" is not a date (use DD/MM/YYYY or YYYY-MM-DD, or DD/MM for every year).` };
    // A date without a year repeats every year, unless the row says No.
    const repeatsYearly = repeats ?? !full;
    if (repeatsYearly) return { holidayDate: monthDay, repeatsYearly };
    if (!full) return { message: `Holiday Date "${raw}" has no year: add the year, or set Repeats Every Year to Yes.` };
    return { holidayDate: full, repeatsYearly };
}

/**
 * Sorts out imported rows: each is new, a duplicate (of a holiday already saved, or of an earlier row in the same
 * file) or an error. A one-off date that a yearly holiday of the same occasion already covers is a duplicate too.
 * Pure, so the rules are tested without a database; `existing` holds `holidayKey`s already saved (`MM-DD` dates for
 * yearly holidays, as the API shows them).
 */
export function classifyImportRows(rows: HolidayImportBody['rows'], existing: ReadonlySet<string>): { result: HolidayImportRowResult; input?: HolidayInput }[] {
    const seenInFile = new Map<string, number>();
    return rows.map(({ rowNumber, values }) => {
        const blank = { rowNumber, occasion: values.occasion ?? '', holidayDate: values.holidayDate ?? '', repeatsYearly: readYesNo(values.repeatsYearly) === true, status: values.status ?? '' };
        const day = readImportDay(values);
        const parsed = holidayInputSchema.safeParse({ ...values, ...('message' in day ? { holidayDate: '', repeatsYearly: undefined } : day) });
        if (!parsed.success || 'message' in day) {
            const messages = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message));
            if ('message' in day) {
                for (const message of [...messages]) if (message.startsWith('Holiday Date') || message.startsWith('Repeats Every Year')) messages.delete(message);
                messages.add(day.message);
            }
            return { result: { ...blank, outcome: 'error', messages: [...messages] } };
        }
        const input = parsed.data;
        const shown = { rowNumber, occasion: input.occasion, holidayDate: input.holidayDate, repeatsYearly: input.repeatsYearly, status: input.status };
        const key = holidayKey(input.holidayDate, input.occasion);
        const yearlyKey = input.repeatsYearly ? key : holidayKey(input.holidayDate.slice(5), input.occasion);
        if (existing.has(key)) return { result: { ...shown, outcome: 'duplicate', messages: ['Already in the holiday list.'] } };
        if (existing.has(yearlyKey)) return { result: { ...shown, outcome: 'duplicate', messages: ['Already in the list as a holiday every year.'] } };
        const earlier = seenInFile.get(key) ?? seenInFile.get(yearlyKey);
        if (earlier !== undefined) return { result: { ...shown, outcome: 'duplicate', messages: [`Same as row ${earlier}.`] } };
        seenInFile.set(key, rowNumber);
        return { result: { ...shown, outcome: 'new', messages: [] }, input };
    });
}

/**
 * The days `[from, to]` on which the yearly holidays fall (`MM-DD` each), one entry per year. 29 Feb is kept on
 * 28 Feb in years without it.
 */
export function expandYearly(rows: { id: string; occasion: string; monthDay: string }[], from: string, to: string): CalendarHoliday[] {
    const out: CalendarHoliday[] = [];
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
        for (const row of rows) {
            const day = yearlyDateIn(row.monthDay, year);
            if (day >= from && day <= to) out.push({ id: `${row.id}@${year}`, occasion: row.occasion, holidayDate: day, repeatsYearly: true });
        }
    }
    return out;
}

/** One-off and yearly days together, by date then occasion; a one-off copy of a yearly holiday on its day is shown once. */
export function mergeCalendarDays(oneOff: CalendarHoliday[], yearly: CalendarHoliday[]): CalendarHoliday[] {
    const seen = new Set(yearly.map((day) => holidayKey(day.holidayDate, day.occasion)));
    return [...yearly, ...oneOff.filter((day) => !seen.has(holidayKey(day.holidayDate, day.occasion)))].sort(
        (a, b) => a.holidayDate.localeCompare(b.holidayDate) || a.occasion.localeCompare(b.occasion),
    );
}

export const holidayService = {
    async list(query: HolidayListQuery, now = new Date()): Promise<HolidayListResult> {
        const where = listWhere(query);
        // By date, the yearly holidays come first (their stored year is a placeholder), then the one-off ones.
        const orderBy: Prisma.HolidayOrderByWithRelationInput[] =
            query.sortBy === 'holidayDate' ? [{ repeatsYearly: 'desc' }, { holidayDate: query.sortOrder }] : [{ [query.sortBy]: query.sortOrder }];
        if (query.sortBy !== 'holidayDate') orderBy.push({ holidayDate: 'desc' });
        orderBy.push({ occasion: 'asc' });
        const [rows, total, bounds] = await Promise.all([
            prisma.holiday.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
            prisma.holiday.count({ where }),
            prisma.holiday.aggregate({ where: { repeatsYearly: false }, _min: { holidayDate: true }, _max: { holidayDate: true } }),
        ]);
        return {
            data: rows.map(toHolidayDto),
            total,
            page: query.page,
            limit: query.limit,
            years: yearsBetween(bounds._min.holidayDate, bounds._max.holidayDate, now.getUTCFullYear()),
        };
    },

    async getById(id: string): Promise<HolidayDto> {
        const row = await prisma.holiday.findUnique({ where: { id } });
        if (!row) throw HttpError.notFound('Holiday not found');
        return toHolidayDto(row);
    },

    async create(body: unknown, user: AuthUser): Promise<HolidayDto> {
        const input = holidayInputSchema.parse(body);
        return guardDuplicate(input, () =>
            runInTransaction(async (tx) => {
                await assertNotDuplicate(tx, input);
                const row = await tx.holiday.create({
                    data: { ...input, holidayDate: storedDate(input), createdBy: user.username },
                });
                const dto = toHolidayDto(row);
                await auditService.record(tx, { entityType: 'Holiday', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: auditSnapshot(dto) });
                return dto;
            }),
        );
    },

    /** Partial update: the body is merged onto the stored holiday and validated as a whole. */
    async update(id: string, body: Record<string, unknown>, user: AuthUser): Promise<HolidayDto> {
        const existing = await prisma.holiday.findUnique({ where: { id } });
        if (!existing) throw HttpError.notFound('Holiday not found');
        const before = toHolidayDto(existing);
        const input = holidayInputSchema.parse({ ...auditSnapshot(before), ...body });
        return guardDuplicate(input, () =>
            runInTransaction(async (tx) => {
                await assertNotDuplicate(tx, input, id);
                const row = await tx.holiday.update({
                    where: { id },
                    data: { ...input, holidayDate: storedDate(input), updatedBy: user.username },
                });
                const after = toHolidayDto(row);
                const changes = diffRecords(auditSnapshot(before), auditSnapshot(after));
                if (Object.keys(changes).length > 0) {
                    const action = Object.keys(changes).length === 1 && changes.status ? 'STATUS_CHANGE' : 'UPDATE';
                    await auditService.record(tx, { entityType: 'Holiday', entityId: id, action, changedBy: user.username, changes });
                }
                return after;
            }),
        );
    },

    async remove(id: string, user: AuthUser): Promise<void> {
        await runInTransaction(async (tx) => {
            const row = await tx.holiday.findUnique({ where: { id } });
            if (!row) throw HttpError.notFound('Holiday not found');
            await tx.holiday.delete({ where: { id } });
            await auditService.record(tx, { entityType: 'Holiday', entityId: id, action: 'DELETE', changedBy: user.username, changes: auditSnapshot(toHolidayDto(row)) });
        });
    },

    /** Activate, deactivate or delete several holidays. Returns how many changed. */
    async bulk(action: HolidayBulkAction, ids: string[], user: AuthUser): Promise<{ affected: number }> {
        return runInTransaction(async (tx) => {
            const rows = await tx.holiday.findMany({ where: { id: { in: ids } } });
            if (action === 'delete') {
                if (rows.length === 0) return { affected: 0 };
                await tx.holiday.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
                await auditService.recordMany(
                    tx,
                    rows.map((row): AuditEntry => ({ entityType: 'Holiday', entityId: row.id, action: 'DELETE', changedBy: user.username, changes: auditSnapshot(toHolidayDto(row)) })),
                );
                return { affected: rows.length };
            }
            const status = action === 'activate' ? 'Active' : 'Inactive';
            const changing = rows.filter((row) => row.status !== status);
            if (changing.length === 0) return { affected: 0 };
            await tx.holiday.updateMany({ where: { id: { in: changing.map((r) => r.id) } }, data: { status, updatedBy: user.username } });
            await auditService.recordMany(
                tx,
                changing.map((row): AuditEntry => ({
                    entityType: 'Holiday',
                    entityId: row.id,
                    action: 'STATUS_CHANGE',
                    changedBy: user.username,
                    changes: { status: { from: row.status, to: status } },
                })),
            );
            return { affected: changing.length };
        });
    },

    /**
     * Checks (dry run) or imports spreadsheet rows. New rows are added in one transaction; rows that repeat a saved
     * holiday or an earlier row are skipped, and unreadable rows are reported. Each added holiday gets a CREATE audit
     * entry, and the import an IMPORT summary, all tagged source IMPORT.
     */
    async import(body: HolidayImportBody, user: AuthUser): Promise<HolidayImportResult> {
        const days = [...new Set(body.rows.map((row) => parseImportDate(row.values.holidayDate)).filter((d): d is string => Boolean(d)))];
        // The one-off holidays on the file's dates, and every yearly holiday (a short list).
        const saved = await prisma.holiday.findMany({
            where: { OR: [{ repeatsYearly: true }, ...(days.length ? [{ holidayDate: { in: days.map(fromDateOnly) } }] : [])] },
            select: { holidayDate: true, repeatsYearly: true, occasion: true },
        });
        const existing = new Set(saved.map((row) => holidayKey(shownDate(row), row.occasion)));
        const classified = classifyImportRows(body.rows, existing);
        const rows = classified.map((c) => c.result);
        const inputs = classified.flatMap((c) => (c.input ? [c.input] : []));
        const summary = {
            dryRun: body.dryRun,
            total: rows.length,
            created: inputs.length,
            duplicates: rows.filter((r) => r.outcome === 'duplicate').length,
            failed: rows.filter((r) => r.outcome === 'error').length,
            rows,
        };
        if (body.dryRun || inputs.length === 0) return summary;

        const importId = randomUUID();
        await runWithAuditOrigin({ ...currentAuditOrigin(), source: 'IMPORT', requestId: importId }, async () => {
            try {
                await runInTransaction(async (tx) => {
                    const data = inputs.map((input) => ({
                        id: randomUUID(),
                        ...input,
                        holidayDate: storedDate(input),
                        createdBy: user.username,
                    }));
                    for (let i = 0; i < data.length; i += CREATE_CHUNK) {
                        await tx.holiday.createMany({ data: data.slice(i, i + CREATE_CHUNK) });
                    }
                    await auditService.recordMany(
                        tx,
                        data.map((row, i): AuditEntry => ({ entityType: 'Holiday', entityId: row.id, action: 'CREATE', changedBy: user.username, changes: { ...inputs[i] } })),
                    );
                });
            } catch (err) {
                if (isUniqueViolation(err)) {
                    throw new HttpError('Some of these holidays were added by someone else meanwhile. Check the file again and retry.', StatusCodes.CONFLICT, {
                        code: DUPLICATE_CODE,
                    });
                }
                throw err;
            }
            await auditService.enqueue({
                entityType: 'Import',
                entityId: importId,
                action: 'IMPORT',
                changedBy: user.username,
                changes: { entity: 'holidays', fileName: body.fileName, total: summary.total, created: summary.created, failed: summary.failed, skipped: summary.duplicates },
            });
        });
        return summary;
    },

    /** Active holidays on the days `[from, to]` (inclusive), for the calendar and the activity forms. */
    async calendar(from: string, to: string): Promise<CalendarHoliday[]> {
        const [oneOff, yearly] = await Promise.all([
            prisma.holiday.findMany({
                where: { status: 'Active', repeatsYearly: false, holidayDate: { gte: fromDateOnly(from), lte: fromDateOnly(to) } },
                select: { id: true, occasion: true, holidayDate: true },
                orderBy: [{ holidayDate: 'asc' }, { occasion: 'asc' }],
                take: 1000,
            }),
            prisma.holiday.findMany({ where: { status: 'Active', repeatsYearly: true }, select: { id: true, occasion: true, holidayDate: true }, take: 1000 }),
        ]);
        return mergeCalendarDays(
            oneOff.map((row) => ({ id: row.id, occasion: row.occasion, holidayDate: toDateOnly(row.holidayDate), repeatsYearly: false })),
            expandYearly(
                yearly.map((row) => ({ id: row.id, occasion: row.occasion, monthDay: toDateOnly(row.holidayDate).slice(5) })),
                from,
                to,
            ),
        );
    },
};
