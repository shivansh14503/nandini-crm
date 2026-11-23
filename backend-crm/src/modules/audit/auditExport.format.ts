import { parseChanges } from './audit.format.js';
import { detailRows, fieldRows, toListItem, type AuditRowLike, type PresentContext } from './auditAdmin.present.js';

/**
 * Columns and cells of an audit log export (pure, unit tested in auditExport.format.test.ts). One row per entry,
 * labelled the way the screen shows it; the field changes and other details as one line each inside their cell.
 */

export const EXPORT_COLUMNS = [
    { header: 'Entry ID', width: 10 },
    { header: 'Time', width: 21 },
    { header: 'Time (UTC)', width: 22 },
    { header: 'User', width: 20 },
    { header: 'Username', width: 16 },
    { header: 'Role', width: 14 },
    { header: 'Category', width: 14 },
    { header: 'Action', width: 16 },
    { header: 'Severity', width: 10 },
    { header: 'Module', width: 18 },
    { header: 'Record Type', width: 16 },
    { header: 'Record ID', width: 38 },
    { header: 'Record Number', width: 20 },
    { header: 'Record Name', width: 30 },
    { header: 'Summary', width: 40 },
    { header: 'Changes', width: 60 },
    { header: 'Details', width: 40 },
    { header: 'Source', width: 14 },
    { header: 'IP Address', width: 16 },
    { header: 'Screen', width: 30 },
    { header: 'Route', width: 30 },
    { header: 'Request ID', width: 38 },
    { header: 'Session ID', width: 38 },
    { header: 'Browser', width: 40 },
    { header: 'Undoes Entry', width: 12 },
] as const;

export const CATEGORY_NAMES: Readonly<Record<string, string>> = { DATA: 'Data', CONFIG: 'Configuration', SECURITY: 'Security' };
const SEVERITY_NAMES: Readonly<Record<string, string>> = { INFO: 'Info', NOTICE: 'Notice', WARNING: 'Warning', CRITICAL: 'Critical' };
const SOURCE_NAMES: Readonly<Record<string, string>> = { UI: 'Web app', API: 'API', IMPORT: 'Import', JOB: 'Background job' };

export interface ExportContext extends PresentContext {
    /** Full name of a username (`system` → System). */
    userName(username: string): string;
}

/** `Assigned To: Ravi → Asha` per changed field; a snapshot (create / delete) as `Field: value`. */
function changesText(rows: ReturnType<typeof fieldRows>): string {
    return rows
        .map((row) => {
            if (row.before === null) return `${row.label}: ${row.after}`;
            if (row.after === null) return `${row.label}: ${row.before}`;
            return `${row.label}: ${row.before} → ${row.after}`;
        })
        .join('\n');
}

/** One entry as the export's cells, in EXPORT_COLUMNS order. */
export function exportCells(row: AuditRowLike, ctx: ExportContext): string[] {
    const changes = parseChanges(row.changesJson);
    const item = toListItem(row, ctx, changes);
    const details = detailRows(row.action, row.module, changes, ctx.labeler)
        .map((detail) => `${detail.label}: ${detail.value}`)
        .join('\n');
    return [
        item.id,
        item.time,
        item.createdAt,
        ctx.userName(row.changedBy),
        row.changedBy,
        row.actorRole ?? '',
        CATEGORY_NAMES[row.category] ?? row.category,
        item.actionLabel,
        SEVERITY_NAMES[row.severity] ?? row.severity,
        item.moduleLabel,
        row.entityType,
        row.entityId,
        item.entityCode ?? '',
        item.entityLabel ?? '',
        item.summary,
        changesText(fieldRows(row.action, row.module, changes, ctx.labeler)),
        details,
        row.source ? (SOURCE_NAMES[row.source] ?? row.source) : '',
        row.ipAddress ?? '',
        row.page ?? '',
        row.route ?? '',
        row.requestId ?? '',
        row.sessionId ?? '',
        row.userAgent ?? '',
        item.revertsId ?? '',
    ];
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Byte order mark: Excel reads a CSV as UTF-8 only with it. */
export const CSV_BOM = '﻿';

/** A spreadsheet treats a cell starting with these as a formula (CSV injection), so such text gets a leading `'`. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
    const text = FORMULA_START.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV record (RFC 4180: CRLF line ends, quoted cells may hold line breaks). */
export const csvLine = (cells: readonly string[]): string => `${cells.map(csvCell).join(',')}\r\n`;

/** `audit-log-2026-11-23-1015.csv` (time in the business timezone). */
export function exportFileName(format: 'csv' | 'xlsx', at: Date, timeZone: string): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(at)
            .map((part) => [part.type, part.value]),
    );
    return `audit-log-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.${format}`;
}
