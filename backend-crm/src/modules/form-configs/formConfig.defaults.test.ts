import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_FIELDS } from './formConfig.defaults.js';

/** docs/field-locking-policy.md: which built-in fields the form builder may relax. */
const byKey = (module: string, fieldKey: string) => {
    const field = DEFAULT_FIELDS.find((f) => f.module === module && f.fieldKey === fieldKey);
    assert.ok(field, `${module}:${fieldKey} is a default field`);
    return field;
};

describe('field locking policy', () => {
    it('keeps identity, relation, ownership and logic fields locked and required', () => {
        for (const [module, key] of [
            ['leads', 'name'],
            ['leads', 'assignedTo'],
            ['contacts', 'mobile'],
            ['opportunities', 'salesStage'],
            ['quotations', 'company'],
            ['quotations', 'billingPostalCode'],
            ['tickets', 'problemReported'],
            ['tickets', 'dueDate'],
        ]) {
            const f = byKey(module, key);
            assert.ok(f.isCoreLocked && f.isRequired, `${module}:${key} stays locked + required`);
        }
    });

    it('makes business-preference fields required by default but not locked', () => {
        for (const [module, key] of [
            ['leads', 'mobile'],
            ['leads', 'nextFollowupDate'],
            ['organizations', 'billingState'],
            ['opportunities', 'commission'],
            ['quotations', 'paymentTerms'],
            ['tickets', 'ticketPriority'],
            ['partner-companies', 'phone'],
        ]) {
            const f = byKey(module, key);
            assert.ok(f.isRequired && !f.isCoreLocked, `${module}:${key} is default-required and unlockable`);
        }
    });

    it('frees Mailing Name and Account Status on organizations', () => {
        for (const key of ['mailingName', 'accountStatus']) {
            const f = byKey('organizations', key);
            assert.ok(!f.isRequired && !f.isCoreLocked, `organizations:${key} is free`);
        }
    });

    it('locks only fields that are also listed as required or conditionally locked', () => {
        const locked = DEFAULT_FIELDS.filter((f) => f.isCoreLocked).length;
        const required = DEFAULT_FIELDS.filter((f) => f.isRequired).length;
        assert.ok(locked < required, 'some required fields are unlockable');
    });
});
