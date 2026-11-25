import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuditRowLike, FieldLabeler } from './auditAdmin.present.js';
import { csvCell, csvLine, EXPORT_COLUMNS, exportCells, exportFileName, fileNamePart, type ExportContext } from './auditExport.format.js';

describe('csvCell', () => {
    it('quotes cells holding commas, quotes or line breaks', () => {
        assert.equal(csvCell('plain'), 'plain');
        assert.equal(csvCell('a, b'), '"a, b"');
        assert.equal(csvCell('say "hi"'), '"say ""hi"""');
        assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
        assert.equal(csvCell(''), '');
    });

    it('defuses text a spreadsheet would run as a formula', () => {
        assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
        assert.equal(csvCell('+919800000001'), "'+919800000001");
        assert.equal(csvCell('-5'), "'-5");
        assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
        assert.equal(csvCell('\tcmd'), "'\tcmd");
        assert.equal(csvCell('a=b'), 'a=b');
    });

    it('ends records with CRLF', () => {
        assert.equal(csvLine(['1', 'a,b', '']), '1,"a,b",\r\n');
    });
});

describe('exportFileName', () => {
    it('stamps the business-timezone time', () => {
        assert.equal(exportFileName('csv', new Date('2026-11-23T04:45:00Z'), 'Asia/Kolkata'), 'audit-log-2026-11-23-1015.csv');
        assert.equal(exportFileName('xlsx', new Date('2026-11-23T20:00:00Z'), 'Asia/Kolkata'), 'audit-log-2026-11-24-0130.xlsx');
    });

    it("names one user's activity after them", () => {
        assert.equal(exportFileName('xlsx', new Date('2026-11-23T04:45:00Z'), 'Asia/Kolkata', 'Asha.K'), 'audit-log-asha.k-2026-11-23-1015.xlsx');
        assert.equal(exportFileName('csv', new Date('2026-11-23T04:45:00Z'), 'Asia/Kolkata', '../..'), 'audit-log-2026-11-23-1015.csv');
    });
});

describe('fileNamePart', () => {
    it('keeps letters, digits, dots and dashes, nothing a path or shell would read', () => {
        assert.equal(fileNamePart('ravi_kumar'), 'ravi-kumar');
        assert.equal(fileNamePart('Meera Iyer'), 'meera-iyer');
        assert.equal(fileNamePart('../etc/passwd'), 'etc-passwd');
        assert.equal(fileNamePart('a'.repeat(60)), 'a'.repeat(40));
        assert.equal(fileNamePart('   '), '');
    });
});

describe('exportCells', () => {
    const labeler: FieldLabeler = {
        label: (_module, key) => ({ assignedTo: 'Assigned To', status: 'Status', name: 'Name' })[key] ?? key,
        value: (_module, key, value) => (value === null || value === undefined || value === '' ? '—' : key === 'assignedTo' ? `User ${String(value)}` : String(value)),
    };
    const ctx: ExportContext = {
        labeler,
        showsRecordNumber: (module) => module === 'leads',
        recordStatus: () => 'live',
        userName: (username) => (username === 'system' ? 'System' : `Name of ${username}`),
    };
    const row: AuditRowLike = {
        id: 101n,
        createdAt: new Date('2026-11-23T04:45:00Z'),
        category: 'DATA',
        action: 'UPDATE',
        severity: 'INFO',
        module: 'leads',
        entityType: 'Lead',
        entityId: 'lead-1',
        entityCode: 'NIPL/L/26-27/1004',
        entityLabel: 'Asha Traders',
        changedFields: '|assignedTo|status|',
        changesJson: JSON.stringify({ assignedTo: { from: 'ravi', to: 'asha' }, status: { from: 'New', to: 'Contacted' }, reason: 'Reassigned' }),
        changedBy: 'meera',
        actorId: 7,
        actorRole: 'Sales Manager',
        source: 'UI',
        requestId: 'req-1',
        sessionId: 'sess-1',
        httpMethod: 'PATCH',
        route: '/api/leads/:id',
        page: '/leads/lead-1',
        ipAddress: '10.0.0.5',
        userAgent: 'Mozilla/5.0',
        revertsId: null,
    };

    it('fills every column in order', () => {
        const cells = exportCells(row, ctx);
        assert.equal(cells.length, EXPORT_COLUMNS.length);
        const byHeader = Object.fromEntries(EXPORT_COLUMNS.map((column, i) => [column.header, cells[i]]));
        assert.equal(byHeader['Entry ID'], '101');
        assert.equal(byHeader['Time (UTC)'], '2026-11-23T04:45:00.000Z');
        assert.equal(byHeader.User, 'Name of meera');
        assert.equal(byHeader.Username, 'meera');
        assert.equal(byHeader.Category, 'Data');
        assert.equal(byHeader.Action, 'Updated');
        assert.equal(byHeader['Record Number'], 'NIPL/L/26-27/1004');
        assert.equal(byHeader.Summary, 'Changed Assigned To, Status');
        assert.equal(byHeader.Changes, 'Assigned To: User ravi → User asha\nStatus: New → Contacted');
        assert.equal(byHeader.Details, 'Reason: Reassigned');
        assert.equal(byHeader.Source, 'Web app');
        assert.equal(byHeader['Undoes Entry'], '');
    });

    it('writes snapshots as one value per field and hides record numbers without a series', () => {
        const created = { ...row, action: 'CREATE', module: 'tickets', entityType: 'Ticket', changesJson: JSON.stringify({ id: 't', name: 'Printer', status: 'Open' }) };
        const byHeader = Object.fromEntries(EXPORT_COLUMNS.map((column, i) => [column.header, exportCells(created, ctx)[i]]));
        assert.equal(byHeader.Changes, 'Name: Printer\nStatus: Open');
        assert.equal(byHeader['Record Number'], '');
    });
});
