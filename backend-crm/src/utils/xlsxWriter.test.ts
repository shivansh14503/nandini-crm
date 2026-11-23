import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { columnName, writeXlsx, xmlEscape } from './xlsxWriter.js';

async function* batches(rows: string[][], size = 2): AsyncGenerator<string[][]> {
    for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

describe('xlsxWriter', () => {
    it('names columns like Excel', () => {
        assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    });

    it('escapes XML and drops characters XML cannot hold', () => {
        assert.equal(xmlEscape('a < b & "c" > d\u0001\u0008'), 'a &lt; b &amp; &quot;c&quot; &gt; d');
        assert.equal(xmlEscape('tab\tline\nend'), 'tab\tline\nend');
    });

    it('writes a workbook Excel readers open, with every value intact', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'xlsx-writer-'));
        try {
            const file = path.join(dir, 'out.xlsx');
            const rows = [
                ['1', 'Asha & Sons <Pvt>', '=SUM(A1:A2)'],
                ['2', 'Line one\nLine two', '  padded  '],
                ['3', 'हिन्दी · 😀', ''],
                ['4', 'x'.repeat(40_000), 'it\'s "quoted"'],
                ['5', 'ctrl\u0007char', 'last'],
            ];
            const handle = await open(file, 'w');
            const written = await writeXlsx(handle, 'Audit log', [{ header: 'ID', width: 8 }, { header: 'Name', width: 30 }, { header: 'Note', width: 20 }], batches(rows));
            await handle.close();
            assert.equal(written, 5);

            const book = XLSX.read(await readFile(file), { type: 'buffer' });
            assert.deepEqual(book.SheetNames, ['Audit log']);
            const sheet = book.Sheets['Audit log'];
            const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
            assert.deepEqual(data[0], ['ID', 'Name', 'Note']);
            assert.deepEqual(data[1], ['1', 'Asha & Sons <Pvt>', '=SUM(A1:A2)']);
            assert.equal(sheet.C2.f, undefined, 'a formula-like text stays text');
            assert.deepEqual(data[2], ['2', 'Line one\nLine two', '  padded  ']);
            assert.deepEqual(data[3], ['3', 'हिन्दी · 😀', '']);
            assert.equal(data[4][1].length, 32_767);
            assert.deepEqual(data[5], ['5', 'ctrlchar', 'last']);
            assert.equal(sheet['!autofilter']?.ref ?? 'A1:C6', 'A1:C6');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('writes an empty sheet with its header row', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'xlsx-writer-'));
        try {
            const file = path.join(dir, 'empty.xlsx');
            const handle = await open(file, 'w');
            assert.equal(await writeXlsx(handle, 'Audit log', [{ header: 'ID', width: 8 }], batches([])), 0);
            await handle.close();
            const book = XLSX.read(await readFile(file), { type: 'buffer' });
            assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets['Audit log'], { header: 1 }), [['ID']]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
