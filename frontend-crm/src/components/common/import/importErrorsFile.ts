import type { TrackedImport } from '@/services/importTracker';

/**
 * Header of the reasons column in the downloaded error file. A file re-uploaded with this as its last column has it
 * dropped on read (`parseFile`), so the rows can be fixed and imported again from the same file.
 */
export const IMPORT_ERRORS_HEADER = 'Errors';

/** Rows the import didn't create: the server's failures plus the rows the preview skipped, in file order. */
export function importProblemRows(item: TrackedImport): { rowNumber: number; errors: string[] }[] {
    const failed = item.result?.failed ?? [];
    return [...failed, ...item.skipped].sort((a, b) => a.rowNumber - b.rowNumber);
}

// Fixed colors on purpose: a spreadsheet file has no light / dark theme.
const ERROR_FILL = 'FFFEE2E2'; // light red
const ERROR_TEXT = 'FF991B1B'; // dark red
const ERROR_HEADER_FILL = 'FFFCA5A5';
const HEADER_FILL = 'FFF1F5F9';

/**
 * Downloads the rows that weren't imported as an .xlsx: exactly the file's own columns (so it can be fixed and
 * imported again) plus an Errors column filled red. A CSV can't carry cell colors, hence a spreadsheet. Without the
 * original file (an import resumed after a reload) it holds a Row number column and the reasons only.
 */
export async function downloadImportErrors(item: TrackedImport): Promise<void> {
    const problems = importProblemRows(item);
    if (problems.length === 0) return;
    const source = item.source;
    const headers = source ? source.headers : ['Row'];
    const data = problems.map(({ rowNumber, errors }) => {
        const values = source ? headers.map((h) => source.rowsByNumber.get(rowNumber)?.[h] ?? '') : [String(rowNumber)];
        return [...values, errors.join('; ')];
    });

    // Loaded lazily so the spreadsheet library is only fetched when someone downloads.
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Not imported', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow([...headers, IMPORT_ERRORS_HEADER]);
    data.forEach((row) => sheet.addRow(row));

    const errorCol = headers.length + 1;
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    });
    sheet.getColumn(errorCol).eachCell((cell, rowNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber === 1 ? ERROR_HEADER_FILL : ERROR_FILL } };
        cell.font = { bold: rowNumber === 1, color: { argb: ERROR_TEXT } };
        cell.alignment = { wrapText: true, vertical: 'top' };
    });
    headers.forEach((h, i) => {
        const longest = Math.max(h.length, ...data.map((row) => String(row[i]).length));
        sheet.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 40);
    });
    sheet.getColumn(errorCol).width = 60;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const base = (source?.fileName ?? item.entity).replace(/\.[^.]+$/, '');
    link.href = url;
    link.download = `${base}-not-imported.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
