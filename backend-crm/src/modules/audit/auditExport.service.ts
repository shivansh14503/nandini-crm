import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import type { AuditExport } from '../../generated/prisma/client.js';
import { auditExportQueue, tryEnqueue } from '../../jobs/queues.js';
import { auditService } from '../../services/audit.service.js';
import { currentAuditOrigin, type AuditOrigin } from '../../services/auditContext.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { writeXlsx } from '../../utils/xlsxWriter.js';
import { auditListQuerySchema, type AuditListFilters } from './auditAdmin.query.js';
import { entryBatches, matchingWhere, presentContext } from './auditAdmin.service.js';
import { CSV_BOM, csvLine, EXPORT_COLUMNS, exportCells, exportFileName, type ExportContext } from './auditExport.format.js';

/**
 * Audit log exports (Admin › Audit Log "Export", admin-only): the entries the list's current filter matches, newest
 * first, as CSV or Excel. Up to INLINE_LIMIT entries the file is written during the request; larger exports run on the
 * `crm-audit-export` queue (in this process when Redis is down) and the screen polls the export until it's ready.
 * Files go to AUDIT_EXPORT_DIR as `<id>.<format>`, are downloadable by the admin who asked for them, and are removed
 * after 24 hours. Every finished export writes an EXPORT entry (SECURITY, NOTICE) with its filter and row count.
 */

export type ExportFormat = 'csv' | 'xlsx';

/** Exports this small are written during the request. */
const INLINE_LIMIT = 5_000;
/** Entries read per query. */
const BATCH_SIZE = 1_000;
/** At most this many of the newest entries per file (Excel opens up to 1,048,576 rows, slowly). */
export const ROW_CAP: Readonly<Record<ExportFormat, number>> = { csv: 1_000_000, xlsx: 500_000 };
const KEEP_MS = 24 * 60 * 60 * 1000;
/** A running export older than this was cut off (process restarted) and is marked failed. */
const STALE_RUNNING_MS = 6 * 60 * 60 * 1000;
/** Rows between progress updates of the export row. */
const PROGRESS_EVERY = 10_000;

export const auditExportBodySchema = z.object({
    format: z.enum(['csv', 'xlsx']),
    /** The list's query (GET /api/admin/audit-logs filters); paging fields are ignored. */
    filters: z.record(z.string(), z.unknown()).default({}),
});

export interface AuditExportJobData {
    exportId: string;
    origin?: AuditOrigin;
}

const filePath = (row: Pick<AuditExport, 'id' | 'format'>) => path.join(ENV.AUDIT.EXPORT_DIR, `${row.id}.${row.format}`);

/** The export as the screen shows it. */
function toDto(row: AuditExport) {
    return {
        id: row.id,
        format: row.format as ExportFormat,
        status: row.status,
        rowCount: row.rowCount,
        truncated: row.truncated,
        cap: ROW_CAP[row.format as ExportFormat] ?? null,
        fileName: row.fileName,
        fileSize: row.fileSize,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        expiresAt: row.finishedAt && row.status === 'completed' ? new Date(row.finishedAt.getTime() + KEEP_MS).toISOString() : null,
    };
}

/** The stored filter with the paging fields left out (they mean nothing for an export). */
function parseFilters(raw: unknown): AuditListFilters {
    const filters = auditListQuerySchema.parse(raw ?? {});
    return { ...filters, cursor: undefined };
}

async function exportContext(): Promise<ExportContext> {
    const [ctx, users] = await Promise.all([presentContext([]), prisma.user.findMany({ select: { username: true, fullName: true } })]);
    const names = new Map(users.map((user) => [user.username.toLowerCase(), user.fullName.trim() || user.username]));
    return { ...ctx, userName: (username) => (username === 'system' ? 'System' : (names.get(username.toLowerCase()) ?? username)) };
}

interface Progress {
    rows: number;
    truncated: boolean;
}

/** The matching entries as cell rows, batch by batch, stopping at the format's cap (`truncated` if more matched). */
async function* cellBatches(filters: AuditListFilters, cap: number, ctx: ExportContext, progress: Progress, onProgress: () => Promise<void>) {
    let reported = 0;
    for await (const rows of entryBatches(filters, BATCH_SIZE)) {
        if (progress.rows >= cap) {
            progress.truncated = true;
            return;
        }
        const batch = rows.slice(0, cap - progress.rows);
        progress.rows += batch.length;
        yield batch.map((row) => exportCells(row, ctx));
        if (batch.length < rows.length) {
            progress.truncated = true;
            return;
        }
        if (progress.rows - reported >= PROGRESS_EVERY) {
            reported = progress.rows;
            await onProgress();
        }
    }
}

async function writeCsv(file: string, batches: AsyncIterable<string[][]>): Promise<void> {
    const out = createWriteStream(file, { encoding: 'utf8' });
    const finished = once(out, 'finish');
    try {
        out.write(CSV_BOM + csvLine(EXPORT_COLUMNS.map((column) => column.header)));
        for await (const batch of batches) {
            if (!out.write(batch.map(csvLine).join(''))) await once(out, 'drain');
        }
        out.end();
        await finished;
    } catch (err) {
        out.destroy();
        throw err;
    }
}

/** Writes the file of export `id` and records the EXPORT entry; marks the export failed (file removed) on any error. */
export async function runExport(id: string, origin?: AuditOrigin): Promise<void> {
    const row = await prisma.auditExport.findUnique({ where: { id } });
    if (!row || (row.status !== 'queued' && row.status !== 'running')) return;
    const format = row.format as ExportFormat;
    const file = filePath(row);
    const progress: Progress = { rows: 0, truncated: false };
    try {
        await prisma.auditExport.update({ where: { id }, data: { status: 'running' } });
        const filters = parseFilters(JSON.parse(row.filtersJson));
        await mkdir(ENV.AUDIT.EXPORT_DIR, { recursive: true });
        const ctx = await exportContext();
        const report = async () => {
            await prisma.auditExport.update({ where: { id }, data: { rowCount: progress.rows } });
        };
        const batches = cellBatches(filters, ROW_CAP[format], ctx, progress, report);
        if (format === 'csv') {
            await writeCsv(file, batches);
        } else {
            const handle = await open(file, 'w');
            try {
                await writeXlsx(handle, 'Audit log', [...EXPORT_COLUMNS], batches);
            } finally {
                await handle.close();
            }
        }
        const { size } = await stat(file);
        // One user's activity (Users tab, or a filter on one user) is named after them.
        const fileName = exportFileName(format, row.createdAt, ENV.BUSINESS_TIMEZONE, filters.user?.length === 1 ? filters.user[0] : undefined);
        // The export counts once it is in the audit log: if that write fails, so does the export.
        await auditService.write({
            entityType: 'AuditExport',
            entityId: id,
            action: 'EXPORT',
            changedBy: row.requestedBy,
            changes: { format, rowCount: progress.rows, truncated: progress.truncated, fileName, filters: JSON.parse(row.filtersJson) as unknown },
            origin,
        });
        await prisma.auditExport.update({
            where: { id },
            data: { status: 'completed', rowCount: progress.rows, truncated: progress.truncated, fileName, fileSize: size, finishedAt: new Date() },
        });
    } catch (err) {
        logger.error({ exportId: id, err: (err as Error).message }, 'Audit log export failed');
        await rm(file, { force: true }).catch(() => undefined);
        await prisma.auditExport
            .update({ where: { id }, data: { status: 'failed', message: 'The export could not be written. Please try again.', finishedAt: new Date() } })
            .catch(() => undefined);
    }
}

/** Removes files older than 24 hours (marking their exports expired) and fails exports cut off mid-run. */
export async function cleanupAuditExports(now = new Date()): Promise<void> {
    const expiredBefore = new Date(now.getTime() - KEEP_MS);
    const expired = await prisma.auditExport.findMany({ where: { status: 'completed', finishedAt: { lt: expiredBefore } }, select: { id: true, format: true } });
    for (const row of expired) await rm(filePath(row), { force: true });
    if (expired.length > 0) await prisma.auditExport.updateMany({ where: { id: { in: expired.map((row) => row.id) } }, data: { status: 'expired' } });
    await prisma.auditExport.updateMany({
        where: { status: { in: ['queued', 'running'] }, createdAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
        data: { status: 'failed', message: 'The export was interrupted. Please try again.', finishedAt: now },
    });
    // Stray files (an export row removed, a crash between write and record).
    try {
        for (const name of await readdir(ENV.AUDIT.EXPORT_DIR)) {
            const full = path.join(ENV.AUDIT.EXPORT_DIR, name);
            const info = await stat(full).catch(() => null);
            if (info?.isFile() && info.mtime < expiredBefore) await rm(full, { force: true });
        }
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn({ err: (err as Error).message }, 'Could not tidy the audit export folder');
    }
}

async function loadOwnExport(params: unknown, user: AuthUser): Promise<AuditExport> {
    const { id } = z.object({ id: z.string().uuid('id must be an export id.') }).parse(params);
    const row = await prisma.auditExport.findUnique({ where: { id } });
    // Someone else's export is "not found": exports hold the whole log, so only their requester sees them.
    if (!row || row.requestedBy.toLowerCase() !== user.username.toLowerCase()) throw HttpError.notFound('Export not found');
    return row;
}

export const auditExportService = {
    /** Starts an export of the entries `filters` match; small ones come back finished. */
    async create(body: unknown, user: AuthUser) {
        const { format, filters: raw } = auditExportBodySchema.parse(body ?? {});
        const filters = parseFilters(raw);
        // Invalid dates fail here (400), before anything is created.
        const where = await matchingWhere(filters);
        // Stored without paging fields; dates and lists as sent so the entry shows what was asked for.
        const stored = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'cursor' && key !== 'limit'));
        const row = await prisma.auditExport.create({
            data: { requestedBy: user.username, format, filtersJson: JSON.stringify(stored), status: 'queued' },
        });
        void cleanupAuditExports().catch((err: Error) => logger.warn({ err: err.message }, 'Audit export cleanup failed'));

        const origin = currentAuditOrigin();
        const probe = where ? await prisma.auditLog.findMany({ where, select: { id: true }, orderBy: { id: 'desc' }, take: INLINE_LIMIT + 1 }) : [];
        if (probe.length > INLINE_LIMIT) {
            const data: AuditExportJobData = { exportId: row.id, origin };
            const jobId = await tryEnqueue(auditExportQueue, 'export', data, { jobId: row.id });
            // No Redis: run here in the background; the screen polls the export either way.
            if (!jobId) void runExport(row.id, origin);
        } else {
            await runExport(row.id, origin);
        }
        return toDto(await prisma.auditExport.findUniqueOrThrow({ where: { id: row.id } }));
    },

    async get(params: unknown, user: AuthUser) {
        return toDto(await loadOwnExport(params, user));
    },

    /** The finished file: its path, download name and content type. 410 once it has been removed. */
    async file(params: unknown, user: AuthUser) {
        const row = await loadOwnExport(params, user);
        if (row.status === 'expired') throw new HttpError('This export has expired. Please export again.', 410, { code: 'EXPORT_EXPIRED' });
        if (row.status !== 'completed' || !row.fileName) throw HttpError.conflict('This export is not ready yet.');
        const full = filePath(row);
        if (!(await stat(full).catch(() => null))) throw new HttpError('This export file is no longer available. Please export again.', 410, { code: 'EXPORT_EXPIRED' });
        const contentType = row.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return { path: full, fileName: row.fileName, contentType };
    },
};
