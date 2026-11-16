import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBuiltInNameMap, checkApiName, resolveBuiltInApiNames, type ApiNameField } from './builtInApiNames.js';

const field = (fieldKey: string, overrides: Partial<ApiNameField> = {}): ApiNameField => ({
    id: fieldKey,
    fieldKey,
    label: fieldKey,
    isSystem: true,
    apiName: null,
    previousFieldKeys: [],
    ...overrides,
});

const reserved = new Set(['id', 'customFields', 'createdAt', 'organizationId', 'companyName', 'email', 'phone']);

describe('checkApiName: built-in fields', () => {
    const company = field('companyName', { label: 'Company Name' });
    const email = field('email', { label: 'Email', apiName: 'contactEmail' });
    const custom = field('cf_region', { label: 'Region', isSystem: false });
    const fields = [company, email, field('phone', { label: 'Phone' }), custom];
    const check = (f: ApiNameField, name: string) => checkApiName(f, name, fields, { reserved });

    it('accepts any plain identifier, cf_ prefix included', () => {
        for (const name of ['customerName', 'customer_name', 'Customer2', 'cf_company']) assert.equal(check(company, name).error, null, name);
    });

    it('rejects names that are not plain identifiers', () => {
        for (const name of ['', '2name', '_name', 'customer-name', 'customer name', 'a'.repeat(81)]) assert.ok(check(company, name).error, name);
    });

    it('is a no-op for the current name', () => {
        assert.deepEqual(check(email, 'contactEmail'), { error: null, warnings: [] });
    });

    it('rejects a name another field already answers to', () => {
        assert.match(check(company, 'phone').error ?? '', /already the API name of 'Phone'/);
        assert.match(check(company, 'contactEmail').error ?? '', /already the API name of 'Email'/);
        assert.match(check(company, 'cf_region').error ?? '', /already the API name of 'Region'/);
    });

    it('only warns about a look-alike in another case', () => {
        const result = check(company, 'Phone');
        assert.equal(result.error, null);
        assert.ok(result.warnings.some((w) => w.includes('upper / lower case')));
    });

    it('rejects a record property that is not a form field', () => {
        assert.match(check(company, 'organizationId').error ?? '', /already have a 'organizationId' property/);
        assert.match(check(company, 'customFields').error ?? '', /property/);
    });

    it('lets a field use its own column, in any case', () => {
        assert.equal(check(company, 'CompanyName').error, null);
        assert.equal(check(email, 'email').error, null);
    });

    it('warns that the old name stops working', () => {
        const result = check(email, 'mail');
        assert.equal(result.error, null);
        assert.ok(result.warnings.some((w) => w.includes("'contactEmail' stops working") && w.includes("'email' always works")));
        // Renaming away from the column: nothing stops working.
        assert.deepEqual(check(company, 'customerName').warnings, []);
    });
});

describe('checkApiName: custom fields', () => {
    const region = field('cf_region', { label: 'Region', isSystem: false });
    const fields = [region, field('status', { label: 'Status' })];

    it('allows a name without the cf_ prefix', () => {
        assert.equal(checkApiName(region, 'region', fields, { moving: 0 }).error, null);
        assert.equal(checkApiName(undefined, 'PONumber', fields).error, null);
    });

    it('still rejects a name another field has', () => {
        assert.match(checkApiName(region, 'status', fields).error ?? '', /already the API name of 'Status'/);
        assert.match(checkApiName(undefined, 'cf_region', fields).error ?? '', /already the API name of 'Region'/);
    });

    it('warns about leftover values, moved records and the forgotten old name', () => {
        const { error, warnings } = checkApiName(region, 'area', fields, { leftovers: 2, moving: 5 });
        assert.equal(error, null);
        assert.ok(warnings.some((w) => w.startsWith('2 records still hold')));
        assert.ok(warnings.some((w) => w.includes('on 5 records')));
        assert.ok(warnings.some((w) => w.includes("'cf_region' stops working")));
    });
});

describe('resolveBuiltInApiNames', () => {
    const names = buildBuiltInNameMap([
        field('companyName', { apiName: 'customerName' }),
        field('email', { previousFieldKeys: ['companyName'] }),
        field('cf_x', { isSystem: false }),
    ]);

    it('moves a value sent under the API name to the column', () => {
        assert.deepEqual(resolveBuiltInApiNames({ customerName: 'Acme', other: 1 }, names), { other: 1, companyName: 'Acme' });
    });

    it('lets the column name win', () => {
        assert.deepEqual(resolveBuiltInApiNames({ customerName: 'api', companyName: 'form' }, names), { companyName: 'form' });
    });

    it('never translates a column name', () => {
        assert.equal(names.has('companyName'), false);
    });

    it('returns the body untouched when nothing needs translating', () => {
        const body = { companyName: 'x' };
        assert.equal(resolveBuiltInApiNames(body, names), body);
    });
});
