import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { opportunityInputSchema } from '../modules/opportunities/opportunity.validator.js';
import { optionalTallySerialNo } from './common.js';
import { tallySerialIssue } from './tallySerial.js';

describe('tallySerialIssue', () => {
    it('accepts blank values and 9 digits starting with 7', () => {
        for (const value of ['', '  ', null, undefined, '712345678', '700000000', ' 799999999 ']) {
            assert.equal(tallySerialIssue(value), null, JSON.stringify(value));
        }
    });

    it('rejects fewer or more than 9 digits', () => {
        assert.equal(tallySerialIssue('71234567'), 'Tally Serial No must be exactly 9 digits (you entered 8).');
        assert.equal(tallySerialIssue('7123456789'), 'Tally Serial No must be exactly 9 digits (you entered 10).');
        assert.equal(tallySerialIssue('7'), 'Tally Serial No must be exactly 9 digits (you entered 1).');
    });

    it('rejects 9 digits that do not start with 7', () => {
        assert.equal(tallySerialIssue('612345678'), 'Tally Serial No must start with 7.');
        assert.equal(tallySerialIssue('012345678'), 'Tally Serial No must start with 7.');
    });

    it('rejects anything other than digits', () => {
        assert.equal(tallySerialIssue('71234A678'), 'Tally Serial No can contain digits only.');
        assert.equal(tallySerialIssue('7 1234567'), 'Tally Serial No can contain digits only.');
        assert.equal(tallySerialIssue('TS-712345'), 'Tally Serial No can contain digits only.');
    });
});

describe('optionalTallySerialNo', () => {
    const schema = optionalTallySerialNo('Tally Serial No');

    it('turns blank into undefined and trims valid values', () => {
        assert.equal(schema.parse(''), undefined);
        assert.equal(schema.parse(null), undefined);
        assert.equal(schema.parse(' 712345678 '), '712345678');
    });

    it('fails with the inline message', () => {
        const result = schema.safeParse('81234567');
        assert.equal(result.success, false);
        assert.equal(result.error?.issues[0]?.message, 'Tally Serial No must be exactly 9 digits (you entered 8).');
    });

    it('is the rule the opportunity API applies', () => {
        const shape = opportunityInputSchema.shape.tallySerialNo;
        assert.equal(shape.safeParse('712345678').success, true);
        assert.equal(shape.safeParse('612345678').success, false);
        assert.equal(shape.safeParse('7123456789').success, false);
    });
});
