import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DISPLAY_FORMATS, type DisplayFormats } from '../company-formats/core/displayFormats.js';
import { displayTime, isDiff } from './audit.format.js';
import {
    cellValue,
    detailRows,
    expandDiff,
    fieldRows,
    humanize,
    namedValue,
    snapshotEntries,
    summarize,
    toListItem,
    type AuditRowLike,
    type FieldLabeler,
    type PresentContext,
} from './auditAdmin.present.js';

const LABELS: Record<string, string> = { assignedTo: 'Assigned To', status: 'Status', name: 'Name', 'customFields.po_number': 'PO Number' };
const labeler: FieldLabeler = {
    label: (_module, key) => LABELS[key] ?? humanize(key.replace(/^customFields\./, '')),
    value: (_module, _key, value) => cellValue(value),
};

describe('names and values', () => {
    it('humanizes keys without a form label', () => {
        assert.equal(humanize('salesStage'), 'Sales Stage');
        assert.equal(humanize('po_number'), 'Po Number');
    });

    it('shows stored values as text', () => {
        assert.equal(cellValue(null), '—');
        assert.equal(cellValue(''), '—');
        assert.equal(cellValue([]), '—');
        assert.equal(cellValue(true), 'Yes');
        assert.equal(cellValue(0), '0');
        assert.equal(cellValue(['Acronis', 'Veeam']), 'Acronis, Veeam');
        assert.equal(cellValue([{ email: 'a@x.in', isPrimary: true }, { email: 'b@x.in' }]), 'a@x.in, b@x.in');
        assert.equal(cellValue({ from: 'New', to: 'Contacted' }), 'New → Contacted');
        assert.equal(cellValue('x'.repeat(2000)).length, 1000);
    });

    it('recognizes one-sided pairs (JSON drops an undefined side)', () => {
        assert.ok(isDiff({ from: 1, to: 2 }));
        assert.ok(isDiff({ to: { modulePrefix: 'L' } }));
        assert.ok(!isDiff({ to: 1, other: 2 }));
        assert.ok(!isDiff({}));
        assert.ok(!isDiff(['from', 'to']));
    });
});

describe('expandDiff', () => {
    it('lists field diffs and spells out the custom fields that changed', () => {
        const changes = {
            assignedTo: { from: 'asha', to: 'ravi' },
            customFields: { from: { po_number: 'PO-1', region: 'North' }, to: { po_number: 'PO-2', region: 'North' } },
            reason: 'Reassigned',
            _meta: { actorRole: 'Admin' },
        };
        assert.deepEqual(expandDiff(changes), [
            { key: 'assignedTo', from: 'asha', to: 'ravi' },
            { key: 'customFields.po_number', from: 'PO-1', to: 'PO-2' },
        ]);
    });

    it('handles custom fields that were empty before', () => {
        assert.deepEqual(expandDiff({ customFields: { from: null, to: { region: 'East' } } }), [{ key: 'customFields.region', from: undefined, to: 'East' }]);
        assert.deepEqual(expandDiff('not json'), []);
    });
});

describe('fieldRows', () => {
    it('labels an update as Field / Before / After', () => {
        const rows = fieldRows('UPDATE', 'leads', { status: { from: 'New', to: 'Contacted' }, customFields: { from: {}, to: { po_number: 'PO-9' } } }, labeler);
        assert.deepEqual(rows, [
            { key: 'status', label: 'Status', before: 'New', after: 'Contacted' },
            { key: 'customFields.po_number', label: 'PO Number', before: '—', after: 'PO-9' },
        ]);
    });

    it('shows a create snapshot as After only, without empty or bookkeeping fields', () => {
        const rows = fieldRows('CREATE', 'leads', { id: 'x', name: 'Asha Traders', remarks: '', emails: [], createdAt: '2026-11-21', customFields: { po_number: 'PO-1', blank: null } }, labeler);
        assert.deepEqual(rows, [
            { key: 'name', label: 'Name', before: null, after: 'Asha Traders' },
            { key: 'customFields.po_number', label: 'PO Number', before: null, after: 'PO-1' },
        ]);
        assert.deepEqual(snapshotEntries(null), []);
    });

    it('shows a delete snapshot as Before only, and nothing for events', () => {
        assert.deepEqual(fieldRows('DELETE', 'tickets', { name: 'X' }, labeler), [{ key: 'name', label: 'Name', before: 'X', after: null }]);
        assert.deepEqual(fieldRows('DELETE', 'leads', null, labeler), []);
        assert.deepEqual(fieldRows('LOGIN', 'users', { ip: '10.0.0.5' }, labeler), []);
    });
});

describe('values in the company formats', () => {
    const saved: DisplayFormats = { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberGrouping: 'international', customized: true };
    const indian12h: DisplayFormats = { ...DEFAULT_DISPLAY_FORMATS, customized: true };
    /** What `cellValue` printed before company formats existed (git show 46ef1b8:…/auditAdmin.present.ts). */
    function oldCellValue(value: unknown): string {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((item) => (item !== null && typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ');
        if (typeof value === 'object') {
            if (isDiff(value)) return `${oldCellValue(value.from)} → ${oldCellValue(value.to)}`;
            return Object.keys(value).length === 0 ? '—' : JSON.stringify(value);
        }
        return String(value);
    }
    const samples: unknown[] = [
        '2026-09-05',
        '2026-11-25T00:00',
        '2026-11-25T12:00',
        '2026-11-24T18:30:00.000Z',
        '2026-02-30',
        125000,
        '125000.50',
        -5,
        0,
        2026,
        null,
        undefined,
        '',
        'Asha Traders',
        ['2026-09-05', '2026-11-25'],
        { from: '2026-09-05', to: null },
        { from: 1000, to: 125000.5 },
    ];

    it('shows every value exactly as before while formats are not saved', () => {
        for (const value of samples) {
            const before = oldCellValue(value);
            assert.equal(cellValue(value), before, `no formats: ${JSON.stringify(value)}`);
            assert.equal(cellValue(value, { formats: DEFAULT_DISPLAY_FORMATS }), before, `defaults: ${JSON.stringify(value)}`);
            assert.equal(cellValue(value, { formats: DEFAULT_DISPLAY_FORMATS, kind: 'amount' }), before, `amount: ${JSON.stringify(value)}`);
            assert.equal(namedValue('cost', value, { formats: DEFAULT_DISPLAY_FORMATS, kind: 'amount' }), before);
        }
    });

    it('shows days, date-times and instants in the saved formats', () => {
        const f = { formats: saved };
        assert.equal(cellValue('2026-09-05', f), '05/09/2026');
        assert.equal(cellValue('2026-11-25T00:00', f), '25/11/2026, 00:00');
        assert.equal(cellValue('2026-11-25T12:00', f), '25/11/2026, 12:00');
        assert.equal(cellValue('2026-11-25T12:00', { formats: indian12h }), '25-Nov-2026, 12:00 PM');
        assert.equal(cellValue('2026-11-25T00:05', { formats: indian12h }), '25-Nov-2026, 12:05 AM');
        assert.equal(cellValue('2026-11-24T18:30:00.000Z', f), displayTime(new Date('2026-11-24T18:30:00.000Z'), saved));
        assert.equal(cellValue('2026-02-30', f), '2026-02-30');
        assert.equal(cellValue(['2026-09-05', '2026-11-25'], f), '05/09/2026, 25/11/2026');
        assert.equal(cellValue({ from: '2026-09-05', to: null }, f), '05/09/2026 → —');
        assert.equal(cellValue('Ref 2026-09-05', f), 'Ref 2026-09-05');
    });

    it('groups amounts only (a number without a form type may be a year or a count)', () => {
        const amount = (formats: DisplayFormats) => ({ formats, kind: 'amount' as const });
        assert.equal(cellValue(1234567, amount(saved)), '1,234,567');
        assert.equal(cellValue(1234567, amount(indian12h)), '12,34,567');
        assert.equal(cellValue('125000.50', amount(indian12h)), '1,25,000.50');
        assert.equal(cellValue(125000.5, amount(saved)), '125,000.50');
        assert.equal(cellValue(-5, amount(saved)), '-5');
        assert.equal(cellValue(0, amount(saved)), '0');
        assert.equal(cellValue(null, amount(saved)), '—');
        assert.equal(cellValue('n/a', amount(saved)), 'n/a');
        assert.equal(cellValue({ from: 1000, to: 125000.5 }, amount(saved)), '1,000 → 125,000.50');
        assert.equal(cellValue(2026, { formats: saved }), '2026');
        assert.equal(namedValue('verificationStatus', 'risky', { formats: saved }), 'Risky');
    });

    it('formats follow-up parts through the labeler\'s formats', () => {
        const changes = { followUp: { nextFollowupDate: '2026-11-25T10:30', response: 'Interested' } };
        assert.equal(detailRows('FOLLOW_UP', 'leads', changes, labeler)[0].value, '2026-11-25T10:30');
        assert.equal(detailRows('FOLLOW_UP', 'leads', changes, { ...labeler, formats: saved })[0].value, '25/11/2026, 10:30');
    });
});

describe('email check entries', () => {
    it('show the result change as a field and the address as a detail', () => {
        const check = { verificationStatus: { from: 'valid', to: 'risky' }, email: 'a@x.in', reason: 'accept_all', runId: 'run-1' };
        const named: FieldLabeler = { label: (_m, key) => (key === 'verificationStatus' ? 'Email Check Result' : key), value: (_m, key, value) => namedValue(key, value) };
        assert.deepEqual(fieldRows('EMAIL_CHECK', 'leads', check, named), [{ key: 'verificationStatus', label: 'Email Check Result', before: 'Valid', after: 'Risky' }]);
        assert.deepEqual(
            detailRows('EMAIL_CHECK', 'leads', check, named).map((row) => [row.label, row.value]),
            [
                ['Email Address', 'a@x.in'],
                ['Reason', 'accept_all'],
                ['Bulk Check', 'run-1'],
            ],
        );
    });
});

describe('detailRows', () => {
    it('lists what an event recorded', () => {
        const rows = detailRows('ACCESS_DENIED', 'users', { method: 'PUT', path: '/api/document-series', message: 'No' }, { ...labeler, label: (_m, key) => key });
        assert.deepEqual(
            rows.map((row) => [row.key, row.value]),
            [
                ['method', 'PUT'],
                ['path', '/api/document-series'],
                ['message', 'No'],
            ],
        );
    });

    it('keeps an update reason and spreads a follow-up block one line per part', () => {
        const rows = detailRows(
            'FOLLOW_UP',
            'leads',
            { status: { from: 'New', to: 'Contacted' }, followUp: { response: 'Interested', remarks: '', status: { from: 'New', to: 'Contacted' } } },
            labeler,
        );
        assert.deepEqual(rows, [
            { key: 'followUp.response', label: 'Follow-up › Response', value: 'Interested' },
            { key: 'followUp.status', label: 'Follow-up › Status', value: 'New → Contacted' },
        ]);
        assert.deepEqual(detailRows('UPDATE', 'leads', { name: { from: 'a', to: 'b' }, reason: 'Typo' }, labeler), [{ key: 'reason', label: 'Reason', value: 'Typo' }]);
        assert.deepEqual(detailRows('CREATE', 'leads', { name: 'a' }, labeler), []);
    });
});

describe('summarize', () => {
    it('names what changed', () => {
        assert.equal(summarize('UPDATE', 'leads', { assignedTo: { from: 'a', to: 'b' }, customFields: { from: {}, to: { po_number: '1' } } }, labeler), 'Changed Assigned To, PO Number');
        const many = Object.fromEntries(['a1', 'b2', 'c3', 'd4', 'e5'].map((key) => [key, { from: 1, to: 2 }]));
        assert.equal(summarize('UPDATE', 'leads', many, labeler), 'Changed A1, B2, C3 +2 more');
        assert.equal(summarize('UPDATE', 'form-customization', { reordered: 4 }, labeler), 'Reordered 4 items');
        assert.equal(summarize('FOLLOW_UP', 'leads', { status: { from: 'New', to: 'Won' }, followUp: {} }, labeler), 'Follow-up recorded: Status');
        assert.equal(summarize('RSVP', 'activities', { attendees: { from: [], to: [] } }, labeler), 'Replied to invitation');
    });

    it('describes events', () => {
        assert.equal(summarize('LOGIN_FAILED', 'users', { ip: '1.2.3.4', reason: 'Wrong password' }, labeler), 'Failed sign-in: Wrong password');
        assert.equal(summarize('ACCESS_DENIED', 'users', { method: 'GET', path: '/api/admin/audit-logs' }, labeler), 'Access refused: GET /api/admin/audit-logs');
        assert.equal(summarize('IMPORT', 'leads', { fileName: 'leads.xlsx', total: 120, created: 118, failed: 2 }, labeler), 'Imported 118 of 120 rows from leads.xlsx');
        assert.equal(summarize('PDF_GENERATED', 'quotations', { templateName: 'Classic' }, labeler), 'PDF generated (Classic)');
        assert.equal(summarize('CREATE', 'leads', {}, labeler), 'Created');
        const check = { verificationStatus: { from: 'unchecked', to: 'invalid' }, email: 'a@x.in', reason: 'mailbox_not_found' };
        assert.equal(summarize('EMAIL_CHECK', 'leads', check, labeler), 'Email checked: a@x.in · Not checked → Invalid');
        assert.equal(summarize('UPDATE', 'leads', { ...check, reason: 'admin_accepted' }, labeler), 'Email accepted: a@x.in · Not checked → Invalid');
        assert.equal(summarize('SOMETHING_NEW', 'leads', null, labeler), 'Something New');
    });

    it('writes the exported row count as before until formats are saved, then in the company grouping', () => {
        for (const rowCount of [0, 1, 999, 1000, 123456, 12345678]) {
            const before = `Exported ${rowCount.toLocaleString('en-IN')} entr${rowCount === 1 ? 'y' : 'ies'} to CSV`;
            assert.equal(summarize('EXPORT', 'audit-log', { rowCount, format: 'csv' }, labeler), before);
            assert.equal(summarize('EXPORT', 'audit-log', { rowCount, format: 'csv' }, { ...labeler, formats: DEFAULT_DISPLAY_FORMATS }), before);
        }
        assert.equal(summarize('EXPORT', 'audit-log', { rowCount: 123456, format: 'xlsx' }, labeler), 'Exported 1,23,456 entries to XLSX');
        const international: DisplayFormats = { ...DEFAULT_DISPLAY_FORMATS, numberGrouping: 'international', customized: true };
        assert.equal(summarize('EXPORT', 'audit-log', { rowCount: 123456, format: 'xlsx' }, { ...labeler, formats: international }), 'Exported 123,456 entries to XLSX');
        assert.equal(summarize('EXPORT', 'audit-log', {}, labeler), 'Exported entries');
    });
});

describe('toListItem', () => {
    const row: AuditRowLike = {
        id: 12345678901n,
        createdAt: new Date('2026-11-21T05:45:00Z'),
        category: 'DATA',
        action: 'UPDATE',
        severity: 'INFO',
        module: 'leads',
        entityType: 'Lead',
        entityId: 'lead-1',
        entityCode: 'NIPL/L/26-27/1004',
        entityLabel: 'Asha Traders',
        changedFields: '|status|',
        changesJson: JSON.stringify({ status: { from: 'New', to: 'Contacted' } }),
        changedBy: 'asha',
        actorId: 7,
        actorRole: 'Sales Manager',
        source: 'UI',
        requestId: 'req-1',
        sessionId: 'sess-1',
        httpMethod: 'PUT',
        route: '/api/leads/:id',
        page: '/leads/lead-1',
        ipAddress: '10.0.0.5',
        userAgent: 'Mozilla/5.0',
        revertsId: null,
    };
    const ctx = (series: boolean): PresentContext => ({ labeler, showsRecordNumber: () => series, recordStatus: () => 'live' });

    it('builds the list row', () => {
        const item = toListItem(row, ctx(true));
        assert.equal(item.id, '12345678901');
        assert.equal(item.time, '21-Nov-2026, 11:15 AM');
        assert.equal(item.entityCode, 'NIPL/L/26-27/1004');
        assert.equal(item.summary, 'Changed Status');
        assert.deepEqual(item.changedFields, ['status']);
        assert.equal(item.moduleLabel, 'Leads');
        assert.equal(item.recordStatus, 'live');
        assert.equal(item.revertsId, null);
    });

    it('hides record numbers until the module has a document series', () => {
        assert.equal(toListItem(row, ctx(false)).entityCode, null);
    });

    it('writes the time in the saved company formats', () => {
        const formats = { ...DEFAULT_DISPLAY_FORMATS, customized: true, dateFormat: 'YYYY-MM-DD', timeFormat: '24h' } as const;
        assert.equal(toListItem(row, { ...ctx(true), formats }).time, '2026-11-21, 11:15');
        assert.equal(toListItem(row, { ...ctx(true), formats: DEFAULT_DISPLAY_FORMATS }).time, '21-Nov-2026, 11:15 AM');
    });
});

describe('displayTime', () => {
    it('keeps the timeline style (business timezone, Sep not Sept) while not customized', () => {
        assert.equal(displayTime(new Date('2026-10-12T05:45:00Z')), '12-Oct-2026, 11:15 AM');
        assert.equal(displayTime(new Date('2026-09-05T18:35:00Z')), '06-Sep-2026, 12:05 AM');
        assert.equal(displayTime(new Date('2026-09-05T06:30:00Z'), DEFAULT_DISPLAY_FORMATS), '05-Sep-2026, 12:00 PM');
    });

    it('follows a saved format', () => {
        const formats = { ...DEFAULT_DISPLAY_FORMATS, customized: true, dateFormat: 'MM/DD/YYYY', timeFormat: '12h' } as const;
        assert.equal(displayTime(new Date('2026-10-12T05:45:00Z'), formats), '10/12/2026, 11:15 AM');
        assert.equal(displayTime(new Date('2026-10-12T13:45:00Z'), { ...formats, timeFormat: '24h' }), '10/12/2026, 19:15');
    });
});
