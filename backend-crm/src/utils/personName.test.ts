import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPersonName } from './personName.js';

describe('formatPersonName', () => {
    const cases: [string, string][] = [
        ['rajesh kumar', 'Rajesh Kumar'],
        ['RAJESH KUMAR', 'Rajesh Kumar'],
        ['ca rajesh kumar', 'CA Rajesh Kumar'],
        ['Ca. Neha Mehta', 'CA. Neha Mehta'],
        ['rajesh ca', 'Rajesh CA'],
        ['carl casey', 'Carl Casey'],
        ['r.k. sharma', 'R.K. Sharma'],
        ['mary-jane  watson', 'Mary-Jane  Watson'],
        ['', ''],
    ];
    for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} → ${expected}`, () => assert.equal(formatPersonName(input), expected));
    }
});
