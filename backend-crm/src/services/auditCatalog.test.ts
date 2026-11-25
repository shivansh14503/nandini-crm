import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    categoryFor,
    changedFieldsOf,
    labelFromChanges,
    moduleFor,
    moduleTitle,
    redact,
    REDACTED,
    severityFor,
} from './auditCatalog.js';

describe('moduleFor', () => {
    it('maps records to their CRM module and admin rows to their admin area', () => {
        assert.equal(moduleFor('Lead'), 'leads');
        assert.equal(moduleFor('PartnerCompany'), 'partner-companies');
        assert.equal(moduleFor('Contract'), 'contracts');
        assert.equal(moduleFor('DropdownOption'), 'form-customization');
        assert.equal(moduleFor('PdfAsset'), 'pdf-templates');
        assert.equal(moduleFor('Scorecard'), 'list-scorecards');
        assert.equal(moduleFor('User'), 'users');
    });
    it('files an import under the module it filled', () => {
        assert.equal(moduleFor('Import', { entity: 'contacts', total: 4 }), 'contacts');
        assert.equal(moduleFor('Import', {}), 'imports');
    });
});

describe('categoryFor / severityFor', () => {
    it('sign-ins and refused access are SECURITY whatever the entity', () => {
        assert.equal(categoryFor('User', 'LOGIN'), 'SECURITY');
        assert.equal(categoryFor('User', 'ACCESS_DENIED'), 'SECURITY');
    });
    it('admin settings are CONFIG, records are DATA', () => {
        assert.equal(categoryFor('FormField', 'UPDATE'), 'CONFIG');
        assert.equal(categoryFor('Scorecard', 'DELETE'), 'CONFIG');
        assert.equal(categoryFor('DrawerLayout', 'UPDATE'), 'CONFIG');
        assert.equal(categoryFor('Quotation', 'UPDATE'), 'DATA');
    });
    it('grades severity', () => {
        assert.equal(severityFor('UPDATE', 'DATA'), 'INFO');
        assert.equal(severityFor('DELETE', 'DATA'), 'NOTICE');
        assert.equal(severityFor('REVERT', 'DATA'), 'NOTICE');
        assert.equal(severityFor('UPDATE', 'CONFIG'), 'NOTICE');
        assert.equal(severityFor('LOGIN_FAILED', 'SECURITY'), 'WARNING');
        assert.equal(severityFor('ACCESS_DENIED', 'SECURITY'), 'WARNING');
        assert.equal(severityFor('LOGIN', 'SECURITY'), 'INFO');
    });
});

describe('changedFieldsOf', () => {
    it('lists the diffed fields of an update, skipping entry metadata', () => {
        const changes = {
            status: { from: 'New', to: 'Qualified' },
            assignedTo: { from: 'a', to: 'b' },
            _meta: { module: 'leads', actorRole: 'Admin' },
            followUp: { from: 'x', to: 'y' },
            reason: 'note',
        };
        assert.equal(changedFieldsOf('UPDATE', changes), '|status|assignedTo|');
    });
    it('counts a value that was added or removed (JSON drops the undefined side)', () => {
        const changes = JSON.parse(JSON.stringify({ companyPrefix: { from: '', to: 'NIPL' }, lead: { from: undefined, to: { modulePrefix: 'L' } } }));
        assert.equal(changedFieldsOf('UPDATE', changes), '|companyPrefix|lead|');
        assert.equal(changedFieldsOf('UPDATE', { removed: { from: 'x' } }), '|removed|');
        assert.equal(changedFieldsOf('UPDATE', { note: { to: 1, by: 'x' } }), null);
    });
    it('is null for snapshots, non-diff actions and empty diffs', () => {
        assert.equal(changedFieldsOf('CREATE', { name: 'Acme' }), null);
        assert.equal(changedFieldsOf('UPDATE', { reordered: 32 }), null);
        assert.equal(changedFieldsOf('UPDATE', null), null);
    });
    it('stays within 1,000 characters', () => {
        const changes = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`field${i}`, { from: 1, to: 2 }]));
        const fields = changedFieldsOf('UPDATE', changes)!;
        assert.ok(fields.length <= 1000);
        assert.ok(fields.startsWith('|field0|') && fields.endsWith('|'));
    });
});

describe('redact', () => {
    it('replaces sensitive keys at any depth, diffs included, without touching the input', () => {
        const input = { username: 'a', password: 'p', nested: { apiKey: 'k', passwordHash: { from: 'x', to: 'y' } }, list: [{ token: 't' }] };
        const out = redact(input);
        assert.deepEqual(out, { username: 'a', password: REDACTED, nested: { apiKey: REDACTED, passwordHash: REDACTED }, list: [{ token: REDACTED }] });
        assert.equal(input.password, 'p');
    });
    it('passes primitives through', () => {
        assert.equal(redact('x'), 'x');
        assert.equal(redact(null), null);
    });
});

describe('moduleTitle', () => {
    it('formats module keys', () => {
        assert.equal(moduleTitle('partner-companies'), 'Partner Companies');
        assert.equal(moduleTitle('leads'), 'Leads');
        assert.equal(moduleTitle('shared'), 'Shared');
        assert.equal(moduleTitle(undefined), undefined);
    });
});

describe('labelFromChanges', () => {
    it('reads the record snapshot, or the new value of a renamed field', () => {
        assert.equal(labelFromChanges('Organization', 'id', { organizationName: 'ACME PVT LTD' }), 'ACME PVT LTD');
        assert.equal(labelFromChanges('City', '7', { cityName: { from: 'Old', to: 'New' } }), 'New');
        assert.equal(labelFromChanges('Ticket', 'id', { organizationName: 'Org' }), 'Org');
        assert.equal(labelFromChanges('Contract', 'id', { contractTitle: 'Tally TSS', organizationName: 'Org' }), 'Tally TSS');
        assert.equal(labelFromChanges('Contract', 'id', { organizationName: 'Org' }), 'Org');
    });
    it('names form-customization entries by module and field, or the whole form', () => {
        assert.equal(labelFromChanges('FormField', 'f1', { _meta: { module: 'leads', fieldLabel: 'Phone 3' } }), 'Leads › Phone 3');
        assert.equal(labelFromChanges('FormField', 'leads', { reordered: 32, _meta: { module: 'leads' } }), 'Leads form');
        assert.equal(labelFromChanges('FormField', 'organizations', { reset: true }), 'Organizations form');
        assert.equal(labelFromChanges('DropdownOption', 'o1', { _meta: { categoryLabel: 'Lead Status', optionLabel: 'Won' } }), 'Lead Status › Won');
    });
    it('names settings rows', () => {
        assert.equal(labelFromChanges('Scorecard', 'opportunities', {}), 'Opportunities scorecard');
        assert.equal(labelFromChanges('DrawerLayout', 'leads', {}), 'Leads drawer layout');
        assert.equal(labelFromChanges('DrawerPiece', 'p1', { name: 'Follow-up card' }), 'Drawer pieces › Follow-up card');
        assert.equal(labelFromChanges('DocumentSeries', 'document-series', {}), 'Document Series');
        assert.equal(labelFromChanges('Import', 'imp1', { fileName: 'leads.xlsx' }), 'leads.xlsx');
        assert.equal(labelFromChanges('AuditExport', 'e1', { format: 'csv', fileName: 'audit-log-2026-11-23-1131.csv' }), 'audit-log-2026-11-23-1131.csv');
    });
    it('is undefined when nothing names the record', () => {
        assert.equal(labelFromChanges('Lead', 'id', {}), undefined);
        assert.equal(labelFromChanges('Lead', 'id', 'not an object'), undefined);
    });
});
