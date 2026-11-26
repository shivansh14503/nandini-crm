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
    type HolidayBulkAction,
    type HolidayImportBody,
    type HolidayInput,
    type HolidayListQuery,
} from './holiday.validator.js';

export interface HolidayDto {
    id: string;
    occasion: string;
    /** `YYYY-MM-DD`. */
    holidayDate: string;
    holidayType: string;
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

/** One active holiday as the calendar and the activity forms read it. */
export interface CalendarHoliday {
    id: string;
    occasion: string;
    holidayDate: string;
    holidayType: string;
}

export type HolidayImportOutcome = 'new' | 'duplicate' | 'error';

export interface HolidayImportRowResult {
    rowNumber: number;
    outcome: HolidayImportOutcome;
    /** The row as it would be saved (blank when it couldn't be read). */
    occasion: string;
    holidayDate: string;
    holidayType: string;
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

export const toHolidayDto = (row: HolidayRow): HolidayDto => ({
    id: row.id,
    occasion: row.occasion,
    holidayDate: toDateOnly(row.holidayDate),
    holidayType: row.holidayType,
    status: row.status,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

/** What the audit log keeps of a holiday (no bookkeeping columns). */
const auditSnapshot = (dto: HolidayDto) => ({ occasion: dto.occasion, holidayDate: dto.holidayDate, holidayType: dto.holidayType, status: dto.status });

const duplicateError = (input: Pick<HolidayInput, 'occasion' | 'holidayDate'>) =>
    new HttpError(`"${input.occasion}" is already a holiday on ${input.holidayDate}.`, StatusCodes.CONFLICT, {
        code: DUPLICATE_CODE,
        errors: [{ message: 'This occasion is already a holiday on this date.', path: ['occasion'] }],
    });

/** Rejects a holiday that already exists on that date (the database compares occasions without letter case). */
async function assertNotDuplicate(tx: TransactionClient, input: HolidayInput, exceptId?: string): Promise<void> {
    const clash = await tx.holiday.findFirst({
        where: { holidayDate: fromDateOnly(input.holidayDate), occasion: input.occasion, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true },
    });
    if (clash) throw duplicateError(input);
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

export function listWhere(query: Pick<HolidayListQuery, 'search' | 'year' | 'status' | 'holidayType'>): Prisma.HolidayWhereInput {
    const and: Prisma.HolidayWhereInput[] = [];
    if (query.year) and.push({ holidayDate: yearRange(query.year) });
    if (query.status) and.push({ status: query.status });
    if (query.holidayType) and.push({ holidayType: query.holidayType });
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

/**
 * Sorts out imported rows: each is new, a duplicate (of a holiday already saved, or of an earlier row in the same
 * file) or an error. Pure, so the rules are tested without a database; `existing` holds `holidayKey`s already saved.
 */
export function classifyImportRows(rows: HolidayImportBody['rows'], existing: ReadonlySet<string>): { result: HolidayImportRowResult; input?: HolidayInput }[] {
    const seenInFile = new Map<string, number>();
    return rows.map(({ rowNumber, values }) => {
        const blank = { rowNumber, occasion: values.occasion ?? '', holidayDate: values.holidayDate ?? '', holidayType: values.holidayType ?? '', status: values.status ?? '' };
        const day = parseImportDate(values.holidayDate);
        const parsed = holidayInputSchema.safeParse({ ...values, holidayDate: day ?? '' });
        if (!parsed.success || !day) {
            const messages = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message));
            if (!day) {
                messages.delete('Holiday Date is required.');
                messages.delete('Holiday Date must be a valid date (YYYY-MM-DD).');
                messages.add(values.holidayDate ? `Holiday Date "${values.holidayDate}" is not a date (use DD/MM/YYYY or YYYY-MM-DD).` : 'Holiday Date is required.');
            }
            return { result: { ...blank, outcome: 'error', messages: [...messages] } };
        }
        const input = parsed.data;
        const shown = { rowNumber, occasion: input.occasion, holidayDate: input.holidayDate, holidayType: input.holidayType, status: input.status };
        const key = holidayKey(input.holidayDate, input.occasion);
        if (existing.has(key)) return { result: { ...shown, outcome: 'duplicate', messages: ['Already in the holiday list.'] } };
        const earlier = seenInFile.get(key);
        if (earlier !== undefined) return { result: { ...shown, outcome: 'duplicate', messages: [`Same as row ${earlier}.`] } };
        seenInFile.set(key, rowNumber);
        return { result: { ...shown, outcome: 'new', messages: [] }, input };
    });
}

export const holidayService = {
    async list(query: HolidayListQuery, now = new Date()): Promise<HolidayListResult> {
        const where = listWhere(query);
        const orderBy: Prisma.HolidayOrderByWithRelationInput[] = [{ [query.sortBy]: query.sortOrder }];
        if (query.sortBy !== 'holidayDate') orderBy.push({ holidayDate: 'desc' });
        orderBy.push({ occasion: 'asc' });
        const [rows, total, bounds] = await Promise.all([
            prisma.holiday.findMany({ where, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
            prisma.holiday.count({ where }),
            prisma.holiday.aggregate({ _min: { holidayDate: true }, _max: { holidayDate: true } }),
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
                    data: { ...input, holidayDate: fromDateOnly(input.holidayDate), createdBy: user.username },
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
                    data: { ...input, holidayDate: fromDateOnly(input.holidayDate), updatedBy: user.username },
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
        const saved = days.length
            ? await prisma.holiday.findMany({ where: { holidayDate: { in: days.map(fromDateOnly) } }, select: { holidayDate: true, occasion: true } })
            : [];
        const existing = new Set(saved.map((row) => holidayKey(toDateOnly(row.holidayDate), row.occasion)));
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
                        holidayDate: fromDateOnly(input.holidayDate),
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
        const rows = await prisma.holiday.findMany({
            where: { status: 'Active', holidayDate: { gte: fromDateOnly(from), lte: fromDateOnly(to) } },
            select: { id: true, occasion: true, holidayDate: true, holidayType: true },
            orderBy: [{ holidayDate: 'asc' }, { occasion: 'asc' }],
            take: 1000,
        });
        return rows.map((row) => ({ id: row.id, occasion: row.occasion, holidayDate: toDateOnly(row.holidayDate), holidayType: row.holidayType }));
    },
};
