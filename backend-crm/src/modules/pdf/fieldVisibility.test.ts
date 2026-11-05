import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultFieldVisibility, flattenVisibility, mergeBranding, mergeFieldVisibility, visibleColumns } from './fieldVisibility.js';
import type { PdfFieldRegistry } from './pdf.types.js';

const registry: PdfFieldRegistry = {
    module: 'QUOTATION',
    fields: [
        { key: 'code', path: 'quotation.code', label: 'Quote No.', group: 'Quotation', type: 'text', defaultVisible: true },
        { key: 'remarks', path: 'quotation.remarks', label: 'Remarks', group: 'Quotation', type: 'multiline', defaultVisible: false },
        { key: 'cf_po', path: 'custom.cf_po', label: 'PO', group: 'Custom Fields', type: 'text', defaultVisible: false },
    ],
    lineItemColumns: [
        { key: 'srNo', label: 'Sr. No.', defaultVisible: true, align: 'center', widthPct: 6 },
        { key: 'productName', label: 'Item', defaultVisible: true, align: 'left' },
        { key: 'note', label: 'Note', defaultVisible: false, align: 'left' },
        { key: 'total', label: 'Total', defaultVisible: true, align: 'right' },
    ],
};

describe('mergeFieldVisibility', () => {
    it('returns registry defaults for empty or malformed JSON', () => {
        const defaults = defaultFieldVisibility(registry);
        assert.deepEqual(mergeFieldVisibility(registry, null), defaults);
        assert.deepEqual(mergeFieldVisibility(registry, '{not json'), defaults);
        assert.deepEqual(defaults.fields, { code: true, remarks: false, cf_po: false });
    });

    it('applies stored booleans and ignores unknown or non-boolean keys', () => {
        const merged = mergeFieldVisibility(registry, JSON.stringify({ fields: { remarks: true, deletedField: true, code: 'yes' } }));
        assert.deepEqual(merged.fields, { code: true, remarks: true, cf_po: false });
    });

    it('keeps stored column order/labels, drops unknown columns and appends new ones', () => {
        const merged = mergeFieldVisibility(registry, {
            fields: {},
            lineItemColumns: [
                { key: 'total', label: 'Amount', visible: true, order: 0 },
                { key: 'gone', label: 'Gone', visible: true, order: 1 },
                { key: 'srNo', label: '#', visible: false, order: 2 },
                { key: 'productName', label: '  ', visible: true, order: 3 },
            ],
        });
        assert.deepEqual(
            merged.lineItemColumns.map((c) => [c.key, c.label, c.visible, c.order]),
            [
                ['total', 'Amount', true, 0],
                ['srNo', '#', false, 1],
                ['productName', 'Item', true, 2],
                ['note', 'Note', false, 3],
            ],
        );
    });

    it('derives visible columns and the flattened show map', () => {
        const merged = mergeFieldVisibility(registry, null);
        assert.deepEqual(visibleColumns(registry, merged).map((c) => `${c.key}:${c.align}`), ['srNo:center', 'productName:left', 'total:right']);
        const show = flattenVisibility(merged);
        assert.equal(show.code, true);
        assert.equal(show.col_note, false);
    });
});

describe('mergeBranding', () => {
    it('keeps valid values and rejects bad colours / asset keys', () => {
        const b = mergeBranding(JSON.stringify({ companyName: 'Acme', accentColor: 'red;}', logoAssetKey: '../x' }));
        assert.equal(b.companyName, 'Acme');
        assert.equal(b.accentColor, '#1d4ed8');
        assert.equal(b.logoAssetKey, undefined);
        assert.equal(mergeBranding({ accentColor: '#0F0', logoAssetKey: 'logo-1' }).logoAssetKey, 'logo-1');
    });
});
