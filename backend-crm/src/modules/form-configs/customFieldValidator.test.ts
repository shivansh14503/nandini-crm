import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import { buildModuleFieldConfig, checkModulePayload, type ModuleFieldConfig } from './customFieldValidator.js';
import type { DropdownCategoryDto, FormConfigsPayload, FormFieldDefinitionDto } from './formConfig.service.js';

function field(overrides: Partial<FormFieldDefinitionDto> & Pick<FormFieldDefinitionDto, 'fieldKey'>): FormFieldDefinitionDto {
    return {
        id: overrides.fieldKey,
        module: 'contacts',
        label: overrides.fieldKey,
        fieldType: 'text',
        tabKey: 'overview',
        tabLabel: null,
        sectionKey: 'details',
        sectionLabel: 'Details',
        defaultSectionKey: null,
        defaultTabKey: null,
        sortOrder: 0,
        fieldSize: null,
        placeholder: null,
        hint: null,
        defaultValue: null,
        isRequired: false,
        isCoreLocked: false,
        isSystem: false,
        isActive: true,
        isVisibleInForm: true,
        isVisibleInDrawer: true,
        dropdownCategoryId: null,
        dropdownCategoryKey: null,
        validationRules: null,
        isDeleted: false,
        ...overrides,
    };
}

const regionCategory: DropdownCategoryDto = {
    id: 'cat-region',
    key: 'region',
    label: 'Region',
    module: 'contacts',
    description: '',
    isSystem: false,
    appRequired: false,
    lockReason: null,
    usedBy: [],
    options: [
        { id: 'o1', categoryId: 'cat-region', value: 'North', label: 'North', meta: null, sortOrder: 1, isActive: true, isSystem: false, isDefault: false },
        { id: 'o2', categoryId: 'cat-region', value: 'South', label: 'South', meta: null, sortOrder: 2, isActive: true, isSystem: false, isDefault: false },
        { id: 'o3', categoryId: 'cat-region', value: 'Legacy', label: 'Legacy', meta: null, sortOrder: 3, isActive: false, isSystem: false, isDefault: false },
    ],
};

function configWith(fields: FormFieldDefinitionDto[]): ModuleFieldConfig {
    const payload = {
        categories: [regionCategory],
        fieldsByModule: { contacts: fields },
        moduleTabs: {},
    } as unknown as FormConfigsPayload;
    return buildModuleFieldConfig(payload, 'contacts');
}

/** Runs the check expecting a 400 VALIDATION_ERROR; returns its field errors. */
function issuesOf(fn: () => unknown) {
    try {
        fn();
    } catch (err) {
        assert.ok(err instanceof HttpError, 'expected an HttpError');
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'VALIDATION_ERROR');
        return err.errors ?? [];
    }
    assert.fail('expected a validation error');
}

describe('checkModulePayload: required fields', () => {
    const config = configWith([
        field({ fieldKey: 'cf_region', label: 'Region', fieldType: 'select', dropdownCategoryId: 'cat-region', isRequired: true }),
        field({ fieldKey: 'cf_consent', label: 'Consent', fieldType: 'checkbox', isRequired: true }),
        field({ fieldKey: 'designation', label: 'Designation', isSystem: true, isRequired: true }),
        field({ fieldKey: 'cf_hidden', label: 'Hidden', isRequired: true, isVisibleInForm: false }),
        field({ fieldKey: 'cf_archived', label: 'Archived', isRequired: true, isActive: false }),
    ]);

    it('reports every missing required field with its RHF path', () => {
        const issues = issuesOf(() => checkModulePayload(config, {}, {}));
        assert.deepEqual(
            issues.map((i) => i.path),
            [['customFields', 'cf_region'], ['customFields', 'cf_consent'], ['designation']],
        );
        assert.equal(issues[1].message, 'Consent must be checked.');
        assert.equal(issues[2].message, 'Designation is required.');
    });

    it('treats blank strings and empty arrays as missing', () => {
        const issues = issuesOf(() => checkModulePayload(config, { designation: '   ' }, { cf_region: '', cf_consent: true }));
        assert.deepEqual(issues.map((i) => i.path.join('.')), ['customFields.cf_region', 'designation']);
    });

    it('passes when filled, never requiring hidden or archived fields', () => {
        const result = checkModulePayload(config, { designation: 'CFO' }, { cf_region: 'North', cf_consent: true });
        assert.deepEqual(result, { cf_region: 'North', cf_consent: true });
    });

    it('on updates, only requires what the request submitted', () => {
        // A stage-only patch: neither customFields nor designation was sent.
        assert.doesNotThrow(() => checkModulePayload(config, {}, {}, { submittedKeys: new Set(['salesStage']) }));
        const issues = issuesOf(() => checkModulePayload(config, {}, {}, { submittedKeys: new Set(['designation']) }));
        assert.deepEqual(issues.map((i) => i.path.join('.')), ['designation']);
    });
});

describe('checkModulePayload: formats and rules', () => {
    const cases: [FormFieldDefinitionDto['fieldType'], unknown, unknown][] = [
        ['email', 'a@b.co', 'not-an-email'],
        ['phone', '+919811234567', '9811234567'],
        ['number', '-12.5', '12a'],
        ['amount', '1999.99', '-5'],
        ['percentage', '100', '101'],
        ['pincode', '110001', '1'],
        ['date', '2026-11-06', '06/11/2026'],
        ['checkbox', false, 'yes'],
        ['multiselect', ['a'], 'a'],
    ];
    for (const [fieldType, valid, invalid] of cases) {
        it(`validates ${fieldType}`, () => {
            const config = configWith([field({ fieldKey: 'cf_x', label: 'X', fieldType })]);
            assert.doesNotThrow(() => checkModulePayload(config, {}, { cf_x: valid }));
            const issues = issuesOf(() => checkModulePayload(config, {}, { cf_x: invalid }));
            assert.deepEqual(issues[0].path, ['customFields', 'cf_x']);
        });
    }

    it('caps text and textarea lengths like the form', () => {
        const config = configWith([field({ fieldKey: 'cf_t', fieldType: 'text' }), field({ fieldKey: 'cf_a', fieldType: 'textarea' })]);
        assert.doesNotThrow(() => checkModulePayload(config, {}, { cf_t: 'x'.repeat(500), cf_a: 'x'.repeat(4000) }));
        assert.equal(issuesOf(() => checkModulePayload(config, {}, { cf_t: 'x'.repeat(501), cf_a: 'x'.repeat(4001) })).length, 2);
    });

    it('applies validationRules min / max / minLength / maxLength / pattern', () => {
        const config = configWith([
            field({ fieldKey: 'cf_qty', label: 'Qty', fieldType: 'number', validationRules: { min: 1, max: '10' } }),
            field({ fieldKey: 'cf_code', label: 'Code', validationRules: { minLength: 3, maxLength: 5, pattern: '[A-Z]+' } }),
        ]);
        assert.doesNotThrow(() => checkModulePayload(config, {}, { cf_qty: '5', cf_code: 'ABCD' }));
        const issues = issuesOf(() => checkModulePayload(config, {}, { cf_qty: 11, cf_code: 'AB' }));
        assert.deepEqual(issues.map((i) => i.message), ['Qty must be at most 10.', 'Code must have at least 3 characters.']);
        // The pattern describes the whole value.
        assert.equal(issuesOf(() => checkModulePayload(config, {}, { cf_code: 'ABc' }))[0].message, 'Code is not in the expected format.');
    });

    it('ignores invalid or oversized admin patterns instead of failing every write', () => {
        const config = configWith([
            field({ fieldKey: 'cf_a', validationRules: { pattern: '([' } }),
            field({ fieldKey: 'cf_b', validationRules: { pattern: 'a'.repeat(500) } }),
        ]);
        assert.doesNotThrow(() => checkModulePayload(config, {}, { cf_a: 'anything', cf_b: 'anything' }));
    });

    it('applies rules to built-in fields an admin configured', () => {
        const config = configWith([field({ fieldKey: 'designation', label: 'Designation', isSystem: true, validationRules: { maxLength: 3 } })]);
        assert.equal(issuesOf(() => checkModulePayload(config, { designation: 'Chief' }, {}))[0].path[0], 'designation');
    });
});

describe('checkModulePayload: dropdown options', () => {
    const config = configWith([
        field({ fieldKey: 'cf_region', label: 'Region', fieldType: 'select', dropdownCategoryId: 'cat-region' }),
        field({ fieldKey: 'cf_regions', label: 'Regions', fieldType: 'multiselect', dropdownCategoryId: 'cat-region' }),
    ]);

    it('accepts active options only', () => {
        assert.doesNotThrow(() => checkModulePayload(config, {}, { cf_region: 'North', cf_regions: ['North', 'South'] }));
        const issues = issuesOf(() => checkModulePayload(config, {}, { cf_region: 'East', cf_regions: ['North', 'West', 'Legacy'] }));
        assert.equal(issues[0].message, 'Region: "East" is not an available option.');
        assert.equal(issues[1].message, 'Regions: "West", "Legacy" are not available options.');
    });

    it('keeps a stored value whose option was since archived', () => {
        const previousCustomFields = { cf_region: 'Legacy', cf_regions: ['Legacy'] };
        assert.doesNotThrow(() =>
            checkModulePayload(config, {}, { cf_region: 'Legacy', cf_regions: ['Legacy', 'North'] }, { previousCustomFields }),
        );
        // ...but an archived option can't be newly picked.
        assert.throws(() => checkModulePayload(config, {}, { cf_region: 'Legacy' }, { previousCustomFields: { cf_region: 'North' } }), HttpError);
    });
});

describe('checkModulePayload: stored values and unknown keys', () => {
    it('skips format checks for unchanged stored values on update', () => {
        const config = configWith([field({ fieldKey: 'cf_email', fieldType: 'email' })]);
        assert.doesNotThrow(() =>
            checkModulePayload(config, {}, { cf_email: 'legacy value' }, { previousCustomFields: { cf_email: 'legacy value' }, submittedKeys: new Set() }),
        );
        assert.throws(() => checkModulePayload(config, {}, { cf_email: 'still bad' }, { previousCustomFields: { cf_email: 'legacy value' } }), HttpError);
    });

    it('drops keys that are not custom fields of the module, keeping archived and hidden values', () => {
        const config = configWith([
            field({ fieldKey: 'cf_active' }),
            field({ fieldKey: 'cf_archived', isActive: false }),
            field({ fieldKey: 'cf_hidden', isVisibleInForm: false }),
            field({ fieldKey: 'designation', isSystem: true }),
        ]);
        const result = checkModulePayload(config, {}, {
            cf_active: 'a',
            cf_archived: 'b',
            cf_hidden: 'c',
            cf_unknown: 'd',
            designation: 'smuggled',
            __proto_like: 'e',
        });
        assert.deepEqual(result, { cf_active: 'a', cf_archived: 'b', cf_hidden: 'c' });
    });

    it('normalizes uppercase fields', () => {
        const config = configWith([field({ fieldKey: 'cf_code', fieldType: 'uppercase' })]);
        assert.deepEqual(checkModulePayload(config, {}, { cf_code: 'ab12' }), { cf_code: 'AB12' });
    });

    it('returns an empty bag when no custom fields were sent', () => {
        assert.deepEqual(checkModulePayload(configWith([]), {}, undefined), {});
    });
});
