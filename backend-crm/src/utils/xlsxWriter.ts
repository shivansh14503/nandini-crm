import type { FileHandle } from 'node:fs/promises';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createDeflateRaw, deflateRawSync } from 'node:zlib';

/**
 * A one-sheet .xlsx written as a stream, so memory stays flat whatever the row count (SheetJS builds the whole
 * workbook in memory: ~1.2 GB for 100 k rows × 24 columns). Cells are inline strings; the header row is bold,
 * frozen and filterable. The file is a ZIP (deflate, data descriptors) of the minimal SpreadsheetML parts.
 * Used by the audit log export (modules/audit/auditExport.service.ts); read back by SheetJS in xlsxWriter.test.ts.
 */

// ── ZIP ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(chunk: Buffer, previous = 0): number {
    let crc = ~previous >>> 0;
    for (let i = 0; i < chunk.length; i++) crc = CRC_TABLE[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
    return ~crc >>> 0;
}

/** Bit 3: sizes and CRC follow the data; bit 11: UTF-8 names. */
const FLAGS = 0x0808;
const DEFLATE = 8;
const VERSION = 20;
const ZIP32_MAX = 0xffffffff;

interface ZipEntry {
    name: Buffer;
    crc: number;
    compressedSize: number;
    size: number;
    offset: number;
}

function dosDateTime(date: Date): { time: number; day: number } {
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

class ZipWriter {
    private offset = 0;
    private readonly entries: ZipEntry[] = [];
    private readonly stamp = dosDateTime(new Date());
    private readonly file: FileHandle;

    constructor(file: FileHandle) {
        this.file = file;
    }

    private async write(buffer: Buffer): Promise<void> {
        await this.file.write(buffer);
        this.offset += buffer.length;
    }

    private localHeader(name: Buffer): Buffer {
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(VERSION, 4);
        header.writeUInt16LE(FLAGS, 6);
        header.writeUInt16LE(DEFLATE, 8);
        header.writeUInt16LE(this.stamp.time, 10);
        header.writeUInt16LE(this.stamp.day, 12);
        // CRC and sizes (14–25) stay 0: the data descriptor carries them.
        header.writeUInt16LE(name.length, 26);
        return Buffer.concat([header, name]);
    }

    private async finishEntry(entry: Omit<ZipEntry, 'offset'>, offset: number): Promise<void> {
        if (entry.size > ZIP32_MAX || this.offset > ZIP32_MAX) throw new Error('The spreadsheet is too large (over 4 GB).');
        const descriptor = Buffer.alloc(16);
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptor.writeUInt32LE(entry.crc, 4);
        descriptor.writeUInt32LE(entry.compressedSize, 8);
        descriptor.writeUInt32LE(entry.size, 12);
        await this.write(descriptor);
        this.entries.push({ ...entry, offset });
    }

    async addFile(name: string, content: string): Promise<void> {
        const nameBytes = Buffer.from(name, 'utf8');
        const data = Buffer.from(content, 'utf8');
        const compressed = deflateRawSync(data);
        const offset = this.offset;
        await this.write(this.localHeader(nameBytes));
        await this.write(compressed);
        await this.finishEntry({ name: nameBytes, crc: crc32(data), compressedSize: compressed.length, size: data.length }, offset);
    }

    /** Streams `chunks` through deflate into the file (backpressure respected end to end). */
    async addStream(name: string, chunks: AsyncIterable<string>): Promise<void> {
        const nameBytes = Buffer.from(name, 'utf8');
        const offset = this.offset;
        await this.write(this.localHeader(nameBytes));
        let crc = 0;
        let size = 0;
        let compressedSize = 0;
        const measure = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                crc = crc32(chunk, crc);
                size += chunk.length;
                callback(null, chunk);
            },
        });
        const sink = new Writable({
            write: (chunk: Buffer, _encoding, callback) => {
                compressedSize += chunk.length;
                this.write(chunk).then(() => callback(), callback);
            },
        });
        const source = Readable.from(
            (async function* () {
                for await (const chunk of chunks) yield Buffer.from(chunk, 'utf8');
            })(),
        );
        await pipeline(source, measure, createDeflateRaw(), sink);
        await this.finishEntry({ name: nameBytes, crc, compressedSize, size }, offset);
    }

    async close(): Promise<void> {
        const start = this.offset;
        for (const entry of this.entries) {
            const header = Buffer.alloc(46);
            header.writeUInt32LE(0x02014b50, 0);
            header.writeUInt16LE(VERSION, 4);
            header.writeUInt16LE(VERSION, 6);
            header.writeUInt16LE(FLAGS, 8);
            header.writeUInt16LE(DEFLATE, 10);
            header.writeUInt16LE(this.stamp.time, 12);
            header.writeUInt16LE(this.stamp.day, 14);
            header.writeUInt32LE(entry.crc, 16);
            header.writeUInt32LE(entry.compressedSize, 20);
            header.writeUInt32LE(entry.size, 24);
            header.writeUInt16LE(entry.name.length, 28);
            header.writeUInt32LE(entry.offset, 42);
            await this.write(Buffer.concat([header, entry.name]));
        }
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(this.entries.length, 8);
        end.writeUInt16LE(this.entries.length, 10);
        end.writeUInt32LE(this.offset - start, 12);
        end.writeUInt32LE(start, 16);
        await this.write(end);
    }
}

// ── SpreadsheetML ────────────────────────────────────────────────────────────

/** Excel's limit per cell. */
const MAX_CELL_LENGTH = 32_767;
// Characters XML 1.0 can't hold (control characters other than tab / newline / carriage return).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlEscape(value: string): string {
    return value.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `A`, `B` … `Z`, `AA` … for a 0-based column index. */
export function columnName(index: number): string {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
}

const STYLE_HEADER = 1;
const STYLE_WRAP = 2;

function cellXml(value: string, style: number): string {
    const text = value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - 1)}…` : value;
    const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
    return `<c t="inlineStr" s="${style}"><is><t${space}>${xmlEscape(text)}</t></is></c>`;
}

function rowXml(index: number, cells: string[], style: number): string {
    return `<row r="${index}">${cells.map((cell) => cellXml(cell, style)).join('')}</row>`;
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK_RELS = `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
/** 0: normal, 1: bold header, 2: wrapped text aligned to the top (multi-line cells). */
const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export interface XlsxColumn {
    header: string;
    /** Width in characters. */
    width: number;
}

/**
 * Writes `rows` (batches of string cells, in column order) as one sheet into `file`. Returns the number of data
 * rows written. `sheetName` is at most 31 characters, without `[]:*?/\`.
 */
export async function writeXlsx(file: FileHandle, sheetName: string, columns: XlsxColumn[], rows: AsyncIterable<string[][]>): Promise<number> {
    const zip = new ZipWriter(file);
    const lastColumn = columnName(Math.max(columns.length - 1, 0));
    let written = 0;

    async function* sheet(): AsyncGenerator<string> {
        const cols = columns.map((column, i) => `<col min="${i + 1}" max="${i + 1}" width="${column.width}" customWidth="1"/>`).join('');
        yield `${XML_HEAD}<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>`;
        yield rowXml(1, columns.map((column) => column.header), STYLE_HEADER);
        for await (const batch of rows) {
            yield batch.map((cells) => rowXml(++written + 1, cells, STYLE_WRAP)).join('');
        }
        yield `</sheetData><autoFilter ref="A1:${lastColumn}${written + 1}"/></worksheet>`;
    }

    await zip.addFile('[Content_Types].xml', CONTENT_TYPES);
    await zip.addFile('_rels/.rels', ROOT_RELS);
    await zip.addStream('xl/worksheets/sheet1.xml', sheet());
    const quoted = `'${sheetName.replace(/'/g, "''")}'`;
    await zip.addFile(
        'xl/workbook.xml',
        `${XML_HEAD}<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlEscape(quoted)}!$A$1:$${lastColumn}$${written + 1}</definedName></definedNames></workbook>`,
    );
    await zip.addFile('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
    await zip.addFile('xl/styles.xml', STYLES);
    await zip.close();
    return written;
}
