import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULES, passwordPolicyIssue } from './passwordPolicy.js';

const ctx = { username: 'palak', currentPassword: 'OldPass123' };

describe('passwordPolicyIssue', () => {
    it('accepts a password that passes every rule', () => {
        assert.equal(passwordPolicyIssue('Sunrise2026', ctx), null);
        assert.equal(passwordPolicyIssue('पासवर्ड1234', ctx), null, 'letters outside A–Z count');
        assert.equal(passwordPolicyIssue('a'.repeat(PASSWORD_MAX_LENGTH - 1) + '1', ctx), null);
    });

    it('needs at least 8 characters, and at most 128', () => {
        assert.equal(PASSWORD_MIN_LENGTH, 8);
        assert.equal(passwordPolicyIssue('', ctx), 'Password must be at least 8 characters.');
        assert.equal(passwordPolicyIssue('abc1234', ctx), 'Password must be at least 8 characters.');
        assert.equal(passwordPolicyIssue('abcd1234', ctx), null);
        assert.equal(passwordPolicyIssue('a1'.repeat(65), ctx), 'Password cannot exceed 128 characters.');
    });

    it('needs a letter and a number', () => {
        assert.equal(passwordPolicyIssue('12345678', ctx), 'Password must contain at least one letter.');
        assert.equal(passwordPolicyIssue('abcdefgh', ctx), 'Password must contain at least one number.');
        assert.equal(passwordPolicyIssue('!!!!!!!!', ctx), 'Password must contain at least one letter.');
    });

    it('refuses the username, whatever its case', () => {
        const user = { username: 'Rahul2026' };
        assert.equal(passwordPolicyIssue('rahul2026', user), 'Password cannot be the same as your username.');
        assert.equal(passwordPolicyIssue('RAHUL2026', { username: ' rahul2026 ' }), 'Password cannot be the same as your username.');
        assert.equal(passwordPolicyIssue('rahul20266', user), null);
        assert.equal(passwordPolicyIssue('rahul2026', { username: '' }), null);
    });

    it('refuses the current password (exact match only)', () => {
        assert.equal(passwordPolicyIssue('OldPass123', ctx), 'New password must be different from your current password.');
        assert.equal(passwordPolicyIssue('oldpass123', ctx), null);
        assert.equal(passwordPolicyIssue('OldPass123', { username: 'palak' }), null, 'not checked without a current password');
        assert.equal(passwordPolicyIssue('OldPass123', { username: 'palak', currentPassword: '' }), null);
    });

    it('reports the first failing rule in checklist order', () => {
        assert.equal(passwordPolicyIssue('ab', { username: 'ab', currentPassword: 'ab' }), 'Password must be at least 8 characters.');
    });
});

describe('PASSWORD_RULES (the live checklist)', () => {
    it('lists the rules with stable keys', () => {
        assert.deepEqual(
            PASSWORD_RULES.map((rule) => rule.key),
            ['minLength', 'letter', 'digit', 'notUsername', 'notCurrent'],
        );
    });

    it('leaves every rule unticked for an empty password', () => {
        assert.deepEqual(
            PASSWORD_RULES.map((rule) => rule.test('', ctx)),
            [false, false, false, false, false],
        );
    });

    it('ticks each rule independently', () => {
        const results = Object.fromEntries(PASSWORD_RULES.map((rule) => [rule.key, rule.test('palak', ctx)]));
        assert.deepEqual(results, { minLength: false, letter: true, digit: false, notUsername: false, notCurrent: true });
    });
});
