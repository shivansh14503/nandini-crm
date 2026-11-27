import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../utils/httpError.js';
import type { ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import type { FormFieldDefinitionDto } from '../form-configs/formConfig.service.js';
import { buildImportPayload, importableFields, matchImportOption, parseImportDate, splitDateTime } from './importValues.js';

function field(overrides: Partial<FormFieldDefinitionDto> & Pick<FormFieldDefinitionDto, 'fieldKey'>): FormFieldDefinitionDto {
    return {
        id: overrides.fieldKey,
        module: 'leads',
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
        isSystem: true,
        isActive: true,
        isVisibleInForm: true,
        isVisibleInDrawer: true,
        isVisibleInConvert: false,
        convertIsRequired: null,
        convertFieldSize: null,
        convertSortOrder: null,
        convertSectionKey: null,
        dropdownCategoryId: null,
        dropdownCategoryKey: null,
        validationRules: null,
        isDeleted: false,
        ...overrides,
    };
}

const config = (fields: FormFieldDefinitionDto[]): ModuleFieldConfig => ({
    module: 'leads',
    fields,
    activeOptions: new Map([['cat-source', new Set(['Website Enquiry', 'CA'])], ['cat-follow', new Set(['Call', 'Task'])]]),
    optionLookup: new Map([
        ['cat-source', new Map([['website enquiry', 'Website Enquiry'], ['web', 'Website Enquiry'], ['ca', 'CA']])],
        ['cat-follow', new Map([['call', 'Call'], ['task', 'Task']])],
    ]),
});

describe('parseImportDate', () => {
    it('reads ISO, day-first and month-name dates', () => {
        assert.deepEqual(parseImportDate('2026-08-15'), { date: '2026-08-15', time: null });
        assert.deepEqual(parseImportDate('15/08/2026'), { date: '2026-08-15', time: null });
        assert.deepEqual(parseImportDate('15-08-26'), { date: '2026-08-15', time: null });
        assert.deepEqual(parseImportDate('15 Aug 2026'), { date: '2026-08-15', time: null });
        assert.deepEqual(parseImportDate('15-Aug-2026'), { date: '2026-08-15', time: null });
        assert.deepEqual(parseImportDate('Aug 15, 2026'), { date: '2026-08-15', time: null });
    });

    it('reads an optional time', () => {
        assert.deepEqual(parseImportDate('15/08/2026 10:30'), { date: '2026-08-15', time: '10:30' });
        assert.deepEqual(parseImportDate('2026-08-15T16:05:00'), { date: '2026-08-15', time: '16:05' });
        assert.deepEqual(parseImportDate('15/08/2026 4 PM'), { date: '2026-08-15', time: '16:00' });
    });

    it('refuses impossible dates and garbage', () => {
        assert.equal(parseImportDate('31/02/2026'), null);
        assert.equal(parseImportDate('tomorrow'), null);
        assert.equal(parseImportDate('15/08/2026 25:00'), null);
    });
});

describe('buildImportPayload', () => {
    it('converts cells by field type and keeps custom fields apart', () => {
        const cfg = config([
            field({ fieldKey: 'leadSource', fieldType: 'select', dropdownCategoryId: 'cat-source' }),
            field({ fieldKey: 'productCategory', fieldType: 'multiselect', dropdownCategoryId: 'cat-source' }),
            field({ fieldKey: 'emailAddress', fieldType: 'email' }),
            field({ fieldKey: 'nextFollowupDate', fieldType: 'datetime' }),
            field({ fieldKey: 'gstNumber', fieldType: 'uppercase' }),
            field({ fieldKey: 'region', isSystem: false, fieldType: 'checkbox' }),
            field({ fieldKey: 'budget', isSystem: false, fieldType: 'amount' }),
            field({ fieldKey: 'documentFile', fieldType: 'file' }),
        ]);
        const { payload, customFields } = buildImportPayload(cfg, {
            leadSource: 'web',
            productCategory: 'ca; Website Enquiry',
            emailAddress: 'a@x.com, b@x.com',
            nextFollowupDate: '01/12/2026 09:15',
            gstNumber: '27abcde1234f1z5',
            'customFields.region': 'yes',
            'customFields.budget': '₹1,500',
            documentFile: 'ignored.pdf',
        });
        assert.deepEqual(payload, {
            leadSource: 'Website Enquiry',
            productCategory: ['CA', 'Website Enquiry'],
            emailAddress: [
                { email: 'a@x.com', isPrimary: true, isOptedOut: false, isInvalidBounce: false },
                { email: 'b@x.com', isPrimary: false, isOptedOut: false, isInvalidBounce: false },
            ],
            nextFollowupDate: '2026-12-01T09:15',
            gstNumber: '27ABCDE1234F1Z5',
        });
        assert.deepEqual(customFields, { region: true, budget: '1500' });
        assert.deepEqual(splitDateTime(payload.nextFollowupDate), { date: '2026-12-01', time: '09:15' });
    });

    it('reads cells of older templates under their old keys', () => {
        const cfg = config([field({ fieldKey: 'emailAddress', fieldType: 'email' }), field({ fieldKey: 'billingAddress', fieldType: 'textarea' })]);
        const { payload } = buildImportPayload(cfg, { email: 'a@x.com', billingStreet: '12 MG Road' });
        assert.equal(payload.billingAddress, '12 MG Road');
        assert.deepEqual(payload.emailAddress, [{ email: 'a@x.com', isPrimary: true, isOptedOut: false, isInvalidBounce: false }]);
    });

    it('refuses options that are not active, Activities-only Followup Types and unreadable cells', () => {
        const cfg = config([
            field({ fieldKey: 'leadSource', label: 'Lead Source', fieldType: 'select', dropdownCategoryId: 'cat-source' }),
            field({ fieldKey: 'followupType', label: 'Followup Type', fieldType: 'select', dropdownCategoryId: 'cat-follow' }),
            field({ fieldKey: 'invoiceDate', label: 'Invoice Date', fieldType: 'date' }),
        ]);
        assert.throws(
            () => buildImportPayload(cfg, { leadSource: 'AMC', followupType: 'Task', invoiceDate: 'soon' }),
            (err: unknown) =>
                err instanceof HttpError &&
                JSON.stringify(err.errors?.map((e) => e.message)) ===
                    JSON.stringify([
                        '"AMC" is not an option of Lead Source. Allowed: Website Enquiry, CA.',
                        '"Task" is not an option of Followup Type. Allowed: Call.',
                        'Invoice Date must be a date (DD-MM-YYYY or YYYY-MM-DD).',
                    ]),
        );
    });

    it("keeps a new manufacturer as typed: the product's Manufacturer is a pick-or-type dropdown", () => {
        const manufacturers = new Map([['tally solutions private limited', 'Tally Solutions Private Limited']]);
        const cfg: ModuleFieldConfig = {
            module: 'products',
            fields: [field({ fieldKey: 'manufacturer', module: 'products', label: 'Manufacturer', fieldType: 'select', dropdownCategoryId: 'cat-mfr' })],
            activeOptions: new Map([['cat-mfr', new Set(manufacturers.values())]]),
            optionLookup: new Map([['cat-mfr', manufacturers]]),
        };
        assert.equal(buildImportPayload(cfg, { manufacturer: 'TALLY SOLUTIONS PRIVATE LIMITED' }).payload.manufacturer, 'Tally Solutions Private Limited');
        assert.equal(buildImportPayload(cfg, { manufacturer: 'Zoho Corporation' }).payload.manufacturer, 'Zoho Corporation');
        // Other modules' dropdowns stay closed.
        assert.throws(() => buildImportPayload({ ...cfg, module: 'leads' }, { manufacturer: 'Zoho Corporation' }), HttpError);
    });

    it('matches options with any case and spacing, and percentage options from bare or fractional numbers', () => {
        const rates = new Map([['0%', '0%'], ['5%', '5%'], ['18%', '18%'], ['28%', '28%']]);
        assert.equal(matchImportOption(rates, '0.18'), '18%');
        assert.equal(matchImportOption(rates, '18'), '18%');
        assert.equal(matchImportOption(rates, ' 18 % '.replace(/ /g, '')), '18%');
        assert.equal(matchImportOption(rates, '0.05'), '5%');
        assert.equal(matchImportOption(rates, '0'), '0%');
        assert.equal(matchImportOption(rates, '0.12'), undefined);
        const sources = new Map([['website enquiry', 'Website Enquiry'], ['ca', 'CA']]);
        assert.equal(matchImportOption(sources, '  WEBSITE\u00a0 enquiry '), 'Website Enquiry');
    });

    it('offers only active, visible, non-file fields', () => {
        const cfg = config([
            field({ fieldKey: 'a' }),
            field({ fieldKey: 'b', isActive: false }),
            field({ fieldKey: 'c', isVisibleInForm: false }),
            field({ fieldKey: 'd', fieldType: 'file' }),
        ]);
        assert.deepEqual(importableFields(cfg).map((f) => f.fieldKey), ['a']);
    });
});
