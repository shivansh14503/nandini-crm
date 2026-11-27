import Papa from 'papaparse';
import type { TrackedImport } from '@/services/importTracker';

/** Rows the import didn't create: the server's failures plus the rows the preview skipped, in file order. */
export function importProblemRows(item: TrackedImport): { rowNumber: number; errors: string[] }[] {
    const failed = item.result?.failed ?? [];
    return [...failed, ...item.skipped].sort((a, b) => a.rowNumber - b.rowNumber);
}

/**
 * Downloads the rows that weren't imported as a CSV: the file's own columns (so it can be fixed and imported again)
 * plus the row number and the reasons. Without the original file (an import resumed after a reload) it holds the
 * row numbers and reasons only.
 */
export function downloadImportErrors(item: TrackedImport): void {
    const problems = importProblemRows(item);
    if (problems.length === 0) return;
    const headers = item.source?.headers ?? [];
    const data = problems.map(({ rowNumber, errors }) => {
        const original = item.source?.rowsByNumber.get(rowNumber) ?? {};
        return [String(rowNumber), ...headers.map((h) => original[h] ?? ''), errors.join('; ')];
    });
    const csv = Papa.unparse({ fields: ['Row', ...headers, 'Errors'], data });
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = (item.source?.fileName ?? item.entity).replace(/\.[^.]+$/, '');
    link.href = url;
    link.download = `${base}-not-imported.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
