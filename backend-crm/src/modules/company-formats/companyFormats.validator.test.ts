import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import { saveCompanyFormatsSchema } from './companyFormats.validator.js';

const valid = { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberGrouping: 'international' };

function issues(body: unknown): { path: string[]; message: string }[] {
    try {
        saveCompanyFormatsSchema.parse(body);
    } catch (err) {
        assert.ok(err instanceof ZodError);
        return err.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message }));
    }
    assert.fail('expected a validation error');
}

describe('saveCompanyFormatsSchema', () => {
    it('accepts every listed value', () => {
        assert.deepEqual(saveCompanyFormatsSchema.parse(valid), valid);
        assert.deepEqual(saveCompanyFormatsSchema.parse({ dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian' }), {
            dateFormat: 'DD-MMM-YYYY',
            timeFormat: '12h',
            numberGrouping: 'indian',
        });
    });

    it('names the field and says what to pick', () => {
        assert.deepEqual(issues({ ...valid, dateFormat: 'DD.MM.YYYY' }), [{ path: ['dateFormat'], message: 'Pick a date format from the list.' }]);
        assert.deepEqual(issues({ ...valid, timeFormat: '12' }), [{ path: ['timeFormat'], message: 'Pick 12-hour or 24-hour time.' }]);
        assert.deepEqual(issues({ ...valid, numberGrouping: 'western' }), [{ path: ['numberGrouping'], message: 'Pick Indian or International number grouping.' }]);
    });

    it('requires all three settings', () => {
        assert.deepEqual(issues({ dateFormat: 'DD/MM/YYYY' }), [
            { path: ['timeFormat'], message: 'Pick 12-hour or 24-hour time.' },
            { path: ['numberGrouping'], message: 'Pick Indian or International number grouping.' },
        ]);
        assert.equal(issues(null).length, 1);
    });

    it('refuses unknown keys (the currency is not a setting)', () => {
        const found = issues({ ...valid, currency: 'USD' });
        assert.equal(found.length, 1);
        assert.equal(found[0].message.includes('currency'), true);
    });
});
