import Papa from 'papaparse';
import type { ParsedFile, RawRow } from './types';

export const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const cellToString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).trim();
};

function buildParsed(fileName: string, matrix: unknown[][]): ParsedFile {
    const nonEmpty = matrix.filter((r) => r.some((c) => cellToString(c) !== ''));
    if (nonEmpty.length === 0) throw new Error('The file is empty.');

    const rawHeaders = nonEmpty[0].map(cellToString);
    const seen = new Map<string, number>();
    const headers = rawHeaders.map((h, i) => {
        const base = h || `Column ${i + 1}`;
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base} (${count + 1})`;
    });

    const rows: RawRow[] = nonEmpty.slice(1).map((r) => {
        const row: RawRow = {};
        headers.forEach((h, i) => {
            row[h] = cellToString(r[i]);
        });
        return row;
    });

    if (rows.length === 0) throw new Error('The file has headers but no data rows.');
    return { fileName, headers, rows };
}

function parseCsv(file: File): Promise<unknown[][]> {
    return new Promise((resolve, reject) => {
        Papa.parse<string[]>(file, {
            skipEmptyLines: 'greedy',
            complete: (res) => resolve(res.data),
            error: (err: Error) => reject(new Error(`Could not read CSV: ${err.message}`)),
        });
    });
}

async function parseSpreadsheet(file: File): Promise<unknown[][]> {
    // Loaded lazily so the large xlsx bundle is only fetched when needed.
    const XLSX = await import('xlsx');
    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('No sheets found');
        return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
            header: 1,
            blankrows: false,
            defval: '',
        });
    } catch {
        throw new Error('Could not read this spreadsheet. It may be corrupted or password protected.');
    }
}

/** Parses a .csv / .xlsx / .xls file. Throws an Error with a user-friendly message on failure. */
export async function parseFile(file: File): Promise<ParsedFile> {
    const name = file.name.toLowerCase();
    const ext = ACCEPTED_EXTENSIONS.find((e) => name.endsWith(e));
    if (!ext) throw new Error('Unsupported file type. Please upload a .csv, .xlsx or .xls file.');
    if (file.size === 0) throw new Error('The file is empty.');
    if (file.size > MAX_FILE_BYTES) throw new Error('The file is too large (max 10 MB).');

    const matrix = ext === '.csv' ? await parseCsv(file) : await parseSpreadsheet(file);
    return buildParsed(file.name, matrix);
}
