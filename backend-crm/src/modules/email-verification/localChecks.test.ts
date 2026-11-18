import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { editDistance, isDisposableDomain, runLocalChecks, suggestDomain } from './localChecks.js';

describe('suggestDomain', () => {
    const cases: [string, string | null][] = [
        ['gmial.com', 'gmail.com'],
        ['gmail.co', 'gmail.com'],
        ['gamil.com', 'gmail.com'],
        ['yahoo.co.n', 'yahoo.co.in'],
        ['hotmial.com', 'hotmail.com'],
        ['rediffmail.co', 'rediffmail.com'],
        ['outlok.com', 'outlook.com'],
        ['gmail.com', null],
        ['mail.com', null],
        ['nandini.com', null],
        ['abc.com', null],
        ['infosys.com', null],
    ];
    for (const [domain, expected] of cases) {
        it(`${domain} → ${expected}`, () => assert.equal(suggestDomain(domain), expected));
    }
});

describe('editDistance', () => {
    it('counts an adjacent swap as one edit', () => assert.equal(editDistance('gmial', 'gmail'), 1));
    it('is zero for equal strings', () => assert.equal(editDistance('abc', 'abc'), 0));
});

describe('isDisposableDomain', () => {
    it('flags known throwaway providers and their subdomains', () => {
        assert.equal(isDisposableDomain('mailinator.com'), true);
        assert.equal(isDisposableDomain('x.mailinator.com'), true);
    });
    it('leaves real providers alone', () => assert.equal(isDisposableDomain('gmail.com'), false));
});

describe('runLocalChecks (no network for these)', () => {
    it('rejects bad syntax', async () => {
        for (const email of ['plainaddress', 'a@@b.com', 'a@b', 'a..b@c.com', '.a@c.com', 'a.@c.com', 'a b@c.com']) {
            assert.equal((await runLocalChecks(email)).status, 'invalid', email);
        }
    });
    it('suggests a fix for a provider typo', async () => {
        const result = await runLocalChecks('Rahul@Gmial.com');
        assert.equal(result.reason, 'typo');
        assert.equal(result.suggestion, 'rahul@gmail.com');
    });
    it('flags disposable providers', async () => {
        assert.equal((await runLocalChecks('x@mailinator.com')).reason, 'disposable');
    });
});
