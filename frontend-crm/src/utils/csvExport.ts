/** One CSV column: header text and how to read the cell from a row. */
export interface CsvColumn<T> {
    header: string;
    value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Neutralizes spreadsheet formula injection (cells starting with =, @, or +/- not followed by a digit), so a
 * phone number like +919811234567 stays as-is but "=HYPERLINK(...)" is exported as text.
 */
function safeCell(text: string): string {
    return /^[=@]/.test(text) || /^[+-][^\d]/.test(text) ? `'${text}` : text;
}

function escapeCell(raw: string | number | boolean | null | undefined): string {
    const text = safeCell(raw === null || raw === undefined ? '' : String(raw));
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds RFC 4180 CSV text (CRLF line endings). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
    const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
    for (const row of rows) lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
    return lines.join('\r\n');
}

/** Downloads `rows` as a UTF-8 CSV file (with BOM so Excel reads non-ASCII text correctly). */
export function downloadCsv<T>(fileName: string, rows: readonly T[], columns: readonly CsvColumn<T>[]): void {
    if (typeof window === 'undefined') return;
    const blob = new Blob(['﻿', toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
