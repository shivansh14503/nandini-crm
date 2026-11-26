import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { duplicateEmailsAmong, emailDomainOf, emailIssueFor, isCompanyEmail, normalizeUserEmail, userEmailBodySchema } from './userEmail.service.js';

describe('company email rule', () => {
    it('normalizes: trimmed, lower-cased, blank → null', () => {
        assert.equal(normalizeUserEmail('  Asha@NandiniInfosys.com '), 'asha@nandiniinfosys.com');
        assert.equal(normalizeUserEmail('   '), null);
        assert.equal(normalizeUserEmail(null), null);
        assert.equal(emailDomainOf('a@B.com'), 'b.com');
        assert.equal(emailDomainOf('nope'), '');
    });
    it('checks company domains exactly (no subdomains)', () => {
        assert.equal(isCompanyEmail('a@nandiniinfosys.com', ['nandiniinfosys.com']), true);
        assert.equal(isCompanyEmail('a@mail.nandiniinfosys.com', ['nandiniinfosys.com']), false);
        assert.equal(isCompanyEmail('a@gmail.com', ['nandiniinfosys.com', 'nipl.in']), false);
    });
    it('finds duplicates among active non-group users only', () => {
        const users = [
            { email: 'A@x.com', isActive: true, isGroupUser: false },
            { email: 'a@x.com ', isActive: true, isGroupUser: false },
            { email: 'b@x.com', isActive: true, isGroupUser: false },
            { email: 'b@x.com', isActive: true, isGroupUser: true },
            { email: 'b@x.com', isActive: false, isGroupUser: false },
        ];
        assert.deepEqual([...duplicateEmailsAmong(users)], ['a@x.com']);
    });
    it('ranks issues missing > duplicate > not_company', () => {
        const dupes = new Set(['dup@gmail.com']);
        assert.equal(emailIssueFor('', dupes, ['x.com']), 'missing');
        assert.equal(emailIssueFor('dup@gmail.com', dupes, ['x.com']), 'duplicate');
        assert.equal(emailIssueFor('a@gmail.com', dupes, ['x.com']), 'not_company');
        assert.equal(emailIssueFor('a@x.com', dupes, ['x.com']), null);
    });
    it('parses the body: blank clears, bad and too-long addresses refused', () => {
        assert.deepEqual(userEmailBodySchema.parse({ email: ' X@Y.com ' }), { email: 'x@y.com', allowOtherDomain: false });
        assert.deepEqual(userEmailBodySchema.parse({ email: '' }), { email: null, allowOtherDomain: false });
        assert.deepEqual(userEmailBodySchema.parse({ email: null }), { email: null, allowOtherDomain: false });
        assert.equal(userEmailBodySchema.safeParse({ email: 'not-an-email' }).success, false);
        assert.equal(userEmailBodySchema.safeParse({ email: `${'a'.repeat(115)}@x.com` }).success, false);
    });
    it('refuses a body without the email key instead of clearing the address', () => {
        for (const body of [{}, { allowOtherDomain: true }]) {
            const parsed = userEmailBodySchema.safeParse(body);
            assert.equal(parsed.success, false);
            assert.deepEqual(parsed.error?.issues[0]?.path, ['email']);
            assert.match(parsed.error?.issues[0]?.message ?? '', /required/);
        }
        assert.match(userEmailBodySchema.safeParse({ email: 'nope' }).error?.issues[0]?.message ?? '', /valid email/);
    });
});
