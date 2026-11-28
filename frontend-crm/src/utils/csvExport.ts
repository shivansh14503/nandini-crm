/** One CSV column: header text and how to read the cell from a row. */
export interface CsvColumn<T> {
    header: string;
    value: (row: T) => string | number | boolean | null | undefined;
}

/** Characters a spreadsheet may start a formula with (OWASP CSV injection list). */
const FORMULA_START = /^[=+\-@\t\r]/;
/** A plain number or phone number (`-1234.50`, `+91 98112 34567`, `(011) 2345-6789`): digits and separators only. */
const PLAIN_NUMBER = /^[+-]?[\d\s().-]*\d[\d\s().-]*$/;

/**
 * Neutralizes spreadsheet formula injection: a cell starting with =, +, -, @, a tab or a carriage return is written
 * with a leading `'` so it opens as text, unless it is only a number or phone number (`-1234.5`, `+919811234567`),
 * which has nothing a spreadsheet could run. `+1+cmd|'/C calc'!A0` and `-2+3` are escaped.
 */
function safeCell(text: string): string {
    return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
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
