import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { documentValues, sameDocument } from './document.sync.js';
import { opportunityLabel, toDocumentDto, type DocumentRow } from './document.mapper.js';
import { documentListQuerySchema } from './document.validator.js';

describe('documentValues', () => {
    it('is null while Add Document is No (the document is removed)', () => {
        assert.equal(documentValues({ addDocument: 'No', documentNo: 'PO-1', documentFile: 'f1' }), null);
        assert.equal(documentValues({}), null);
    });

    it('maps the Documentation fields to columns, blanks to null', () => {
        const values = documentValues({ addDocument: 'Yes', documentNo: ' PO-1 ', documentDate: '2026-11-20', documentRemarks: '', documentFile: 'f1' });
        assert.ok(values);
        assert.equal(values.documentNo, 'PO-1');
        assert.equal(values.documentDate?.toISOString().slice(0, 10), '2026-11-20');
        assert.equal(values.documentRemarks, null);
        assert.equal(values.documentFileId, 'f1');
    });
});

describe('sameDocument', () => {
    const stored = { documentNo: 'PO-1', documentDate: new Date('2026-11-20T00:00:00Z'), documentRemarks: null, documentFileId: 'f1' };

    it('matches a save that changes nothing', () => {
        assert.equal(sameDocument(stored, documentValues({ addDocument: 'Yes', documentNo: 'PO-1', documentDate: '2026-11-20', documentFile: 'f1' })!), true);
    });

    it('sees a new file, number, date or remark', () => {
        const base = { addDocument: 'Yes', documentNo: 'PO-1', documentDate: '2026-11-20', documentFile: 'f1' };
        assert.equal(sameDocument(stored, documentValues({ ...base, documentFile: 'f2' })!), false);
        assert.equal(sameDocument(stored, documentValues({ ...base, documentNo: 'PO-2' })!), false);
        assert.equal(sameDocument(stored, documentValues({ ...base, documentDate: '2026-11-21' })!), false);
        assert.equal(sameDocument(stored, documentValues({ ...base, documentRemarks: 'Signed copy' })!), false);
    });
});

describe('toDocumentDto', () => {
    const row = {
        id: 'd1',
        opportunityId: 'o1',
        documentNo: 'PO-1',
        documentDate: new Date('2026-11-20T00:00:00Z'),
        documentRemarks: null,
        documentFileId: 'f1',
        createdBy: 'mittal.sharma',
        updatedBy: null,
        createdAt: new Date('2026-11-21T05:00:00Z'),
        updatedAt: new Date('2026-11-21T05:00:00Z'),
        documentFile: { id: 'f1', fileName: 'PO.pdf', mimeType: 'application/pdf', sizeBytes: 1200 },
        opportunity: {
            id: 'o1',
            opportunityCode: 'OPP-0001',
            opportunityName: null,
            productCategoryJson: '["Tally Prime","TSS"]',
            organizationName: 'Acme Traders',
            organizationId: 'org1',
            contact: 'Ravi Kumar',
            contactId: null,
            salesStage: 'PO',
            assignedTo: 'archit.gupta',
            createdBy: 'archit.gupta',
        },
    } satisfies DocumentRow;

    it('uses the opportunity form keys and links the opportunity', () => {
        const dto = toDocumentDto(row);
        assert.equal(dto.documentNo, 'PO-1');
        assert.equal(dto.documentDate, '2026-11-20');
        assert.equal(dto.documentRemarks, '');
        assert.equal(dto.documentFile?.url, '/api/files/f1');
        assert.equal(dto.opportunity, 'Tally Prime, TSS');
        assert.equal(dto.opportunityCode, 'OPP-0001');
        assert.equal(dto.organizationId, 'org1');
        assert.equal(dto.contactId, undefined);
        assert.equal(dto.assignedTo, 'archit.gupta');
        assert.equal(dto.updatedBy, '');
    });

    it('labels an opportunity by name, then products, then organization', () => {
        assert.equal(opportunityLabel({ opportunityName: 'Renewal', productCategoryJson: '["TSS"]', organizationName: 'Acme' }), 'Renewal');
        assert.equal(opportunityLabel({ opportunityName: null, productCategoryJson: null, organizationName: 'Acme' }), 'Acme');
    });
});

describe('documentListQuerySchema', () => {
    it('reads the filters', () => {
        assert.deepEqual(documentListQuerySchema.parse({ mine: 'true', opportunityId: 'o1', createdWithinDays: '7' }), { mine: true, opportunityId: 'o1', createdWithinDays: 7 });
    });
});
