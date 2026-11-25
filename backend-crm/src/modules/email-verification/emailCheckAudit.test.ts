import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changedFieldsOf } from '../../services/auditCatalog.js';
import { emailCheckEntries, resultLabel, type CheckedRow } from './emailCheckAudit.js';

const row = (overrides: Partial<CheckedRow>): CheckedRow => ({
    email: 'a@acme.in',
    leadId: null,
    contactId: null,
    organizationId: null,
    referralId: null,
    verificationStatus: null,
    verificationReason: null,
    verifiedAt: null,
    ...overrides,
});

describe('resultLabel', () => {
    it('tells never-checked from checked-without-an-answer', () => {
        assert.equal(resultLabel(null, false), 'unchecked');
        assert.equal(resultLabel(null, true), 'undecided');
        assert.equal(resultLabel('risky', true), 'risky');
    });
});

describe('emailCheckEntries', () => {
    const options = { action: 'EMAIL_CHECK' as const, changedBy: 'system' };

    it('writes one entry per record whose result changed, on that record', () => {
        const rows = [
            row({ leadId: 'L1' }),
            row({ contactId: 'C1', verificationStatus: 'valid', verificationReason: 'accepted_email', verifiedAt: new Date() }),
            row({ organizationId: 'O1', email: 'b@acme.in', verificationStatus: 'valid', verificationReason: 'accepted_email', verifiedAt: new Date() }),
            row({ referralId: 'R1' }),
        ];
        const results: Record<string, { status: string; reason: string }> = {
            'a@acme.in': { status: 'invalid', reason: 'rejected_email' },
            'b@acme.in': { status: 'valid', reason: 'accepted_email' },
        };
        const entries = emailCheckEntries(rows, (email) => results[email], { ...options, runId: 'run-1' });

        assert.equal(entries.length, 3, 'the unchanged organization address writes nothing');
        assert.deepEqual(
            entries.map((e) => [e.entityType, e.entityId, e.severity]),
            [
                ['Lead', 'L1', 'NOTICE'],
                ['Contact', 'C1', 'NOTICE'],
                ['Referral', 'R1', 'NOTICE'],
            ],
        );
        assert.deepEqual(entries[0].changes, {
            verificationStatus: { from: 'unchecked', to: 'invalid' },
            email: 'a@acme.in',
            reason: 'rejected_email',
            runId: 'run-1',
        });
        assert.equal(changedFieldsOf('EMAIL_CHECK', entries[0].changes), '|verificationStatus|');
    });

    it('records a reason-only change, and an undecided result on a never-checked address', () => {
        const reasonOnly = emailCheckEntries(
            [row({ leadId: 'L1', verificationStatus: 'valid', verificationReason: 'accepted_email', verifiedAt: new Date() })],
            () => ({ status: 'valid', reason: 'admin_accepted' }),
            { action: 'UPDATE', changedBy: 'admin' },
        );
        assert.equal(reasonOnly.length, 1);
        assert.equal(reasonOnly[0].severity, undefined);

        const undecided = emailCheckEntries([row({ leadId: 'L1' })], () => ({ status: null, reason: 'domain_ok' }), options);
        assert.deepEqual((undecided[0].changes as { verificationStatus: unknown }).verificationStatus, { from: 'unchecked', to: 'undecided' });
    });

    it('skips addresses without a result or without an owner record', () => {
        assert.equal(emailCheckEntries([row({ leadId: 'L1' })], () => undefined, options).length, 0);
        assert.equal(emailCheckEntries([row({})], () => ({ status: 'valid', reason: 'x' }), options).length, 0);
    });
});
