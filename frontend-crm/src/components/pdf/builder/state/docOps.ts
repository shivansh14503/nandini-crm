import { BANDS, BLOCK_BANDS, cloneBlock, cloneSection, newId, normalizeWidths, type Band, type Block, type Column, type PdfDocument, type Section } from '@/lib/pdf-document';

/**
 * Pure lookups and in-place mutations of a PdfDocument draft (callers run them inside immer's `produce`).
 * Ids are unique across the whole document, so everything is addressed by id.
 */

export type Selection =
    | { kind: 'section'; id: string }
    | { kind: 'column'; id: string }
    | { kind: 'block'; id: string };

export interface SectionLocation {
    band: Band;
    index: number;
    section: Section;
}

export interface ColumnLocation extends SectionLocation {
    columnIndex: number;
    column: Column;
}

export interface BlockLocation extends ColumnLocation {
    blockIndex: number;
    block: Block;
}

export function findSection(doc: PdfDocument, id: string): SectionLocation | null {
    for (const band of BANDS) {
        const index = doc[band].findIndex((s) => s.id === id);
        if (index >= 0) return { band, index, section: doc[band][index] };
    }
    return null;
}

export function findColumn(doc: PdfDocument, id: string): ColumnLocation | null {
    for (const band of BANDS) {
        for (let index = 0; index < doc[band].length; index++) {
            const section = doc[band][index];
            const columnIndex = section.columns.findIndex((c) => c.id === id);
            if (columnIndex >= 0) return { band, index, section, columnIndex, column: section.columns[columnIndex] };
        }
    }
    return null;
}

export function findBlock(doc: PdfDocument, id: string): BlockLocation | null {
    for (const band of BANDS) {
        for (let index = 0; index < doc[band].length; index++) {
            const section = doc[band][index];
            for (let columnIndex = 0; columnIndex < section.columns.length; columnIndex++) {
                const column = section.columns[columnIndex];
                const blockIndex = column.blocks.findIndex((b) => b.id === id);
                if (blockIndex >= 0) return { band, index, section, columnIndex, column, blockIndex, block: column.blocks[blockIndex] };
            }
        }
    }
    return null;
}

/** Whether a block of this type may live in the band. */
export const blockAllowedIn = (type: Block['type'], band: Band): boolean => {
    const allowed = BLOCK_BANDS[type];
    return !allowed || allowed.includes(band);
};

export const BAND_LABELS: Record<Band, string> = { header: 'Header', body: 'Body', footer: 'Footer' };

// ─── Sections ───────────────────────────────────────────────────────────────────

export function insertSection(doc: PdfDocument, band: Band, index: number, section: Section): void {
    doc[band].splice(Math.max(0, Math.min(index, doc[band].length)), 0, section);
}

/** Moves a section to `index` of `band` (index counted in the list without the moved section). */
export function moveSection(doc: PdfDocument, id: string, band: Band, index: number): void {
    const from = findSection(doc, id);
    if (!from) return;
    const [section] = doc[from.band].splice(from.index, 1);
    insertSection(doc, band, index, section);
}

export function removeSection(doc: PdfDocument, id: string): void {
    const at = findSection(doc, id);
    if (at) doc[at.band].splice(at.index, 1);
}

export function duplicateSection(doc: PdfDocument, id: string): string | null {
    const at = findSection(doc, id);
    if (!at) return null;
    const copy = cloneSection(at.section);
    doc[at.band].splice(at.index + 1, 0, copy);
    return copy.id;
}

/** Sets the column count, keeping existing columns' blocks (blocks of removed columns move to the last kept one). */
export function setColumnWidths(doc: PdfDocument, sectionId: string, widths: number[]): void {
    const at = findSection(doc, sectionId);
    if (!at) return;
    const section = at.section;
    const normalized = normalizeWidths(widths);
    while (section.columns.length > normalized.length) {
        const removed = section.columns.pop() as Column;
        section.columns[section.columns.length - 1].blocks.push(...removed.blocks);
    }
    while (section.columns.length < normalized.length) {
        section.columns.push({ id: newId('c'), widthPct: 0, style: {}, blocks: [] });
    }
    section.columns.forEach((c, i) => {
        c.widthPct = normalized[i];
    });
}

/**
 * Deletes a column together with its blocks. Its width goes to the neighbouring column (the one on the left,
 * else the one on the right) so the other columns keep their size. Deleting the only column deletes the section.
 */
export function removeColumn(doc: PdfDocument, id: string): void {
    const at = findColumn(doc, id);
    if (!at) return;
    const columns = at.section.columns;
    if (columns.length <= 1) {
        doc[at.band].splice(at.index, 1);
        return;
    }
    const [removed] = columns.splice(at.columnIndex, 1);
    const neighbour = columns[Math.max(0, at.columnIndex - 1)];
    neighbour.widthPct = Math.round((neighbour.widthPct + removed.widthPct) * 100) / 100;
}

/** Resizes the boundary between column `i` and `i + 1`; `leftPct` is column i's new width. */
export function resizeColumnPair(doc: PdfDocument, sectionId: string, i: number, leftPct: number): void {
    const at = findSection(doc, sectionId);
    if (!at) return;
    const [a, b] = [at.section.columns[i], at.section.columns[i + 1]];
    if (!a || !b) return;
    const pair = a.widthPct + b.widthPct;
    const left = Math.round(Math.min(Math.max(leftPct, 5), pair - 5) * 100) / 100;
    a.widthPct = left;
    b.widthPct = Math.round((pair - left) * 100) / 100;
}

// ─── Blocks ─────────────────────────────────────────────────────────────────────

export function insertBlock(doc: PdfDocument, columnId: string, index: number, block: Block): boolean {
    const at = findColumn(doc, columnId);
    if (!at || !blockAllowedIn(block.type, at.band)) return false;
    at.column.blocks.splice(Math.max(0, Math.min(index, at.column.blocks.length)), 0, block);
    return true;
}

/** Moves a block to `index` of a column (index counted in the list without the moved block). */
export function moveBlock(doc: PdfDocument, id: string, columnId: string, index: number): boolean {
    const from = findBlock(doc, id);
    const to = findColumn(doc, columnId);
    if (!from || !to || !blockAllowedIn(from.block.type, to.band)) return false;
    const [block] = from.column.blocks.splice(from.blockIndex, 1);
    const target = findColumn(doc, columnId) as ColumnLocation;
    target.column.blocks.splice(Math.max(0, Math.min(index, target.column.blocks.length)), 0, block);
    return true;
}

export function removeBlock(doc: PdfDocument, id: string): void {
    const at = findBlock(doc, id);
    if (at) at.column.blocks.splice(at.blockIndex, 1);
}

export function duplicateBlock(doc: PdfDocument, id: string): string | null {
    const at = findBlock(doc, id);
    if (!at) return null;
    const copy = cloneBlock(at.block);
    at.column.blocks.splice(at.blockIndex + 1, 0, copy);
    return copy.id;
}

/** Moves the selected element one step up / down within its list. */
export function nudge(doc: PdfDocument, selection: Selection, direction: -1 | 1): void {
    if (selection.kind === 'section') {
        const at = findSection(doc, selection.id);
        if (!at) return;
        const list = doc[at.band];
        const to = at.index + direction;
        if (to < 0 || to >= list.length) return;
        [list[at.index], list[to]] = [list[to], list[at.index]];
    } else if (selection.kind === 'block') {
        const at = findBlock(doc, selection.id);
        if (!at) return;
        const list = at.column.blocks;
        const to = at.blockIndex + direction;
        if (to < 0 || to >= list.length) return;
        [list[at.blockIndex], list[to]] = [list[to], list[at.blockIndex]];
    }
}

export function removeSelected(doc: PdfDocument, selection: Selection): void {
    if (selection.kind === 'section') removeSection(doc, selection.id);
    else if (selection.kind === 'block') removeBlock(doc, selection.id);
    else removeColumn(doc, selection.id);
}

/** The selection still points at something in the document. */
export function selectionExists(doc: PdfDocument, selection: Selection | null): boolean {
    if (!selection) return false;
    if (selection.kind === 'section') return findSection(doc, selection.id) !== null;
    if (selection.kind === 'column') return findColumn(doc, selection.id) !== null;
    return findBlock(doc, selection.id) !== null;
}
