import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CATEGORIES, DEFAULT_FIELDS, DEFAULT_SELECTED_OPTIONS, MODULE_TABS } from './formConfig.defaults.js';
import { ratingRuleFromMeta } from '../leads/lead.rating.js';
import { allowedStagesFromMeta, CLOSED_STAGES, noFollowUpFromMeta } from '../opportunities/opportunity.followUp.js';

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
            ['contracts', 'contractTitle'],
            ['contracts', 'status'],
            ['contracts', 'assignedTo'],
            ['contracts', 'organizationName'],
            ['contracts', 'contact'],
        ]) {
            const f = byKey(module, key);
            assert.ok(f.isCoreLocked && f.isRequired, `${module}:${key} stays locked + required`);
        }
    });

    it('makes business-preference fields required by default but not locked', () => {
        for (const [module, key] of [
            ['leads', 'mobile'],
            ['organizations', 'billingState'],
            ['opportunities', 'commission'],
            ['quotations', 'paymentTerms'],
            ['tickets', 'ticketPriority'],
            ['partner-companies', 'officePhone'],
            ['contracts', 'contractValue'],
            ['contracts', 'contractPeriod'],
            ['contracts', 'contractType'],
            ['contracts', 'billAmount'],
        ]) {
            const f = byKey(module, key);
            assert.ok(f.isRequired && !f.isCoreLocked, `${module}:${key} is default-required and unlockable`);
        }
    });

    it("locks the organization's Nature of Partner, required only when Customer Type is Partner", () => {
        const f = byKey('organizations', 'natureOfPartner');
        assert.ok(f.isCoreLocked && !f.isRequired);
        assert.equal(f.dropdownCategoryKey, 'partner_nature');
    });

    it("locks the lead's Next Followup Date: every open lead is rated from it", () => {
        const f = byKey('leads', 'nextFollowupDate');
        assert.ok(f.isRequired && f.isCoreLocked);
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

describe('contracts defaults', () => {
    it('has one Overview tab whose three sections hold every contract field', () => {
        assert.deepEqual(MODULE_TABS.contracts, [{ key: 'overview', label: 'Overview' }]);
        const fields = DEFAULT_FIELDS.filter((f) => f.module === 'contracts');
        assert.ok(fields.every((f) => f.tabKey === 'overview'));
        assert.deepEqual([...new Set(fields.map((f) => f.sectionLabel))], ['Contract Details', 'Term & Renewal', 'Billing']);
        assert.equal(byKey('contracts', 'assignedTo').label, 'Contract Manager');
        assert.equal(byKey('contracts', 'contractType').fieldType, 'multiselect');
        assert.equal(byKey('contracts', 'renewalReminderDate').fieldType, 'datetime');
        for (const key of ['opportunity', 'tallySerialNo', 'startDate', 'endDate', 'renewalReminderDate', 'description']) {
            const f = byKey('contracts', key);
            assert.ok(!f.isRequired && !f.isCoreLocked, `contracts:${key} is free`);
        }
    });

    it("links each dropdown to a contracts category and starts Status on 'Not Started'", () => {
        const categories = new Map(DEFAULT_CATEGORIES.filter((c) => c.module === 'contracts').map((c) => [c.key, c]));
        assert.deepEqual([...categories.keys()], ['contract_title', 'contract_status', 'contract_period', 'contract_type']);
        for (const f of DEFAULT_FIELDS.filter((field) => field.module === 'contracts' && field.dropdownCategoryKey)) {
            assert.ok(categories.has(f.dropdownCategoryKey!), `contracts:${f.fieldKey} uses a contracts dropdown`);
        }
        const system = categories.get('contract_status')!.options.filter((o) => typeof o !== 'string' && o.isSystem);
        assert.deepEqual(system.map((o) => (typeof o === 'string' ? o : o.value)), ['Not Started', 'Expired']);
        assert.deepEqual(DEFAULT_SELECTED_OPTIONS.contract_status, ['Not Started']);
    });
});

describe('Customer Response list', () => {
    const list = DEFAULT_CATEGORIES.find((c) => c.key === 'shared_customer_response');
    const options = (list?.options ?? []).map((o) => (typeof o === 'string' ? { value: o, meta: undefined } : o));
    const stages = (DEFAULT_CATEGORIES.find((c) => c.key === 'opportunity_sales_stage')?.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));

    it('is one list for the same field (key and label) on leads and opportunities', () => {
        assert.equal(byKey('leads', 'customerResponse').dropdownCategoryKey, 'shared_customer_response');
        assert.equal(byKey('opportunities', 'customerResponse').dropdownCategoryKey, 'shared_customer_response');
        assert.equal(byKey('leads', 'customerResponse').label, byKey('opportunities', 'customerResponse').label);
    });

    it('gives every option a valid starting Rating rule', () => {
        assert.equal(options.length, 15);
        for (const option of options) assert.ok(ratingRuleFromMeta(option.meta), `${option.value} has a valid ratingRule`);
    });

    it('rates the dead ends Cold and shares the unanswered-call counter between No Response and Not Reachable', () => {
        const rule = (value: string) => ratingRuleFromMeta(options.find((o) => o.value === value)?.meta);
        for (const value of ['Not Interested', 'Using Other Software', 'No Requirement', 'Wrong Number', 'Do Not Contact']) {
            assert.deepEqual(rule(value), { rule: 'always', rating: 'Cold' }, value);
        }
        assert.deepEqual(rule('No Response'), rule('Not Reachable'));
        assert.equal(rule('No Response')?.rule, 'unansweredCalls');
    });

    it('lists only open Sales Stages, and offers every open stage at least one response', () => {
        const open = stages.filter((s) => !CLOSED_STAGES.has(s));
        for (const option of options) {
            const allowed = allowedStagesFromMeta(option.meta);
            for (const stage of allowed ?? []) assert.ok(open.includes(stage), `${option.value}: ${stage} is an open stage`);
        }
        for (const stage of open) {
            assert.ok(options.some((o) => { const a = allowedStagesFromMeta(o.meta); return a === null || a.includes(stage); }), `${stage} has responses`);
        }
    });

    it('takes no follow-up only for Do Not Contact', () => {
        assert.deepEqual(options.filter((o) => noFollowUpFromMeta(o.meta)).map((o) => o.value), ['Do Not Contact']);
    });
});
