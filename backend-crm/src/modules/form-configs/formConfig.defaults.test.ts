import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTIVITY_REMINDERS, ACTIVITY_STATUSES } from '../activities/activity.schedule.js';
import { ratingRuleFromMeta } from '../leads/lead.rating.js';
import { allowedStagesFromMeta, CLOSED_STAGES, noFollowUpFromMeta } from '../opportunities/opportunity.followUp.js';
import {
    ACTIVITY_ONLY_FOLLOWUP_TYPES,
    APP_REQUIRED_CATEGORY_KEYS,
    CRM_MODULES,
    DEFAULT_CATEGORIES,
    DEFAULT_FIELDS,
    DEFAULT_SELECTED_OPTIONS,
    FIXED_OPTION_CATEGORY_KEYS,
    FOLLOWUP_TYPE_CATEGORY_KEY,
    MODULE_TABS,
} from './formConfig.defaults.js';

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
            ['activities', 'followupType'],
            ['activities', 'subject'],
            ['activities', 'status'],
            ['activities', 'assignedTo'],
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

const optionValue = (option: string | { value: string }) => (typeof option === 'string' ? option : option.value);

describe('activities defaults', () => {
    const fields = DEFAULT_FIELDS.filter((f) => f.module === 'activities');

    it('is a CRM module with one Overview tab whose three sections hold every activity field', () => {
        assert.ok(CRM_MODULES.indexOf('activities') === CRM_MODULES.indexOf('contracts') + 1);
        assert.deepEqual(MODULE_TABS.activities, [{ key: 'overview', label: 'Overview' }]);
        assert.ok(fields.every((f) => f.tabKey === 'overview'));
        assert.deepEqual([...new Set(fields.map((f) => f.sectionLabel))], ['Activity Details', 'Schedule', 'Outcome & Notes']);
        assert.equal(fields.length, 15);
        assert.equal(byKey('activities', 'followupType').label, 'Followup Type');
        assert.equal(byKey('activities', 'startAt').fieldType, 'datetime');
        assert.equal(byKey('activities', 'remarks').fieldType, 'textarea');
    });

    it('locks the related record and the start, and leaves the rest free', () => {
        for (const key of ['relatedTo', 'startAt']) {
            const f = byKey('activities', key);
            assert.ok(f.isCoreLocked && !f.isRequired, `activities:${key} is locked, not required`);
        }
        for (const key of ['organizationName', 'contact', 'endAt', 'allDay', 'reminder', 'location', 'attendees', 'customerResponse', 'remarks']) {
            const f = byKey('activities', key);
            assert.ok(!f.isRequired && !f.isCoreLocked, `activities:${key} is free`);
        }
        assert.equal(fields.filter((f) => f.isRequired).length, 4);
        assert.equal(fields.filter((f) => f.isCoreLocked && !f.isRequired).length, 2);
    });

    it('links its dropdowns to the shared Followup Type / Customer Response and its own fixed lists', () => {
        assert.equal(byKey('activities', 'followupType').dropdownCategoryKey, FOLLOWUP_TYPE_CATEGORY_KEY);
        assert.equal(byKey('activities', 'customerResponse').dropdownCategoryKey, 'shared_customer_response');
        assert.equal(byKey('activities', 'status').dropdownCategoryKey, 'activity_status');
        assert.equal(byKey('activities', 'reminder').dropdownCategoryKey, 'activity_reminder');
        // Same key and list as on leads and opportunities.
        assert.equal(byKey('leads', 'followupType').dropdownCategoryKey, FOLLOWUP_TYPE_CATEGORY_KEY);
        assert.equal(byKey('opportunities', 'followupType').dropdownCategoryKey, FOLLOWUP_TYPE_CATEGORY_KEY);
    });

    it('has fixed, app-required status and reminder lists matching the code', () => {
        const status = DEFAULT_CATEGORIES.find((c) => c.key === 'activity_status')!;
        const reminder = DEFAULT_CATEGORIES.find((c) => c.key === 'activity_reminder')!;
        assert.equal(status.module, 'activities');
        assert.equal(reminder.module, 'activities');
        assert.deepEqual(status.options.map(optionValue), [...ACTIVITY_STATUSES]);
        assert.deepEqual(reminder.options.map(optionValue), [...ACTIVITY_REMINDERS]);
        for (const category of [status, reminder]) {
            assert.ok(category.options.every((o) => typeof o !== 'string' && o.isSystem), `${category.key} options are system options`);
            assert.ok(FIXED_OPTION_CATEGORY_KEYS.has(category.key), `${category.key} is fixed`);
            assert.ok(APP_REQUIRED_CATEGORY_KEYS.has(category.key), `${category.key} is app-required`);
        }
        assert.deepEqual(DEFAULT_SELECTED_OPTIONS.activity_status, ['Planned']);
        assert.deepEqual(DEFAULT_SELECTED_OPTIONS.activity_reminder, ['15 minutes before']);
    });

    it('adds Task and Note to Followup Type as system options, with durations on the built-in types', () => {
        const category = DEFAULT_CATEGORIES.find((c) => c.key === FOLLOWUP_TYPE_CATEGORY_KEY)!;
        const options = category.options.map((o) => (typeof o === 'string' ? { value: o } : o));
        assert.deepEqual(
            options.filter((o) => o.isSystem).map((o) => o.value),
            [...ACTIVITY_ONLY_FOLLOWUP_TYPES],
        );
        const durations = Object.fromEntries(options.filter((o) => !o.isSystem).map((o) => [o.value, o.meta?.durationMinutes]));
        assert.deepEqual(durations, { Call: 15, Meeting: 60, 'Demo / Presentation': 60, Email: 0, WhatsApp: 0, 'Site Visit': 120 });
        assert.ok(!(DEFAULT_SELECTED_OPTIONS[FOLLOWUP_TYPE_CATEGORY_KEY] ?? []).some((v) => (ACTIVITY_ONLY_FOLLOWUP_TYPES as readonly string[]).includes(v)));
    });
});

describe('dropdown option naming', () => {
    it("gives every default option its label as its value (an option's name is its value)", () => {
        for (const category of DEFAULT_CATEGORIES) {
            for (const option of category.options) {
                if (typeof option === 'string') continue;
                assert.ok(option.label === undefined || option.label === option.value, `${category.key}: ${option.value} has label ${option.label}`);
            }
        }
    });
});

describe('Customer Response list', () => {
    const list = DEFAULT_CATEGORIES.find((c) => c.key === 'shared_customer_response');
    const options = (list?.options ?? []).map((o) => (typeof o === 'string' ? { value: o, meta: undefined } : o));
    const stages = (DEFAULT_CATEGORIES.find((c) => c.key === 'opportunity_sales_stage')?.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));

    it('is one list for the same field (key and label) on leads, opportunities and activities', () => {
        for (const module of ['leads', 'opportunities', 'activities']) {
            assert.equal(byKey(module, 'customerResponse').dropdownCategoryKey, 'shared_customer_response', module);
            assert.equal(byKey(module, 'customerResponse').label, 'Customer Response', module);
        }
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
