import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUserSchema, listUsersQuerySchema, resetPasswordSchema, updateUserSchema, userIdParamSchema } from './userAdmin.validator.js';
import { normalizeUsername, usernameIssue, USERNAME_MAX_LENGTH } from './username.js';

const base = { username: 'palak.sharma', firstName: 'palak', role: 'Sales Executive' };
const firstIssue = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => result.error?.issues[0];

describe('username rules', () => {
    it('normalizes (trimmed, lower-cased) before checking', () => {
        assert.equal(normalizeUsername('  Palak.Sharma '), 'palak.sharma');
        assert.equal(usernameIssue(' Palak.Sharma '), null);
        assert.equal(createUserSchema.parse({ ...base, username: ' Palak_01 ' }).username, 'palak_01');
    });
    it('needs 3–50 characters', () => {
        assert.equal(usernameIssue(''), 'Username is required.');
        assert.equal(usernameIssue('   '), 'Username is required.');
        assert.equal(usernameIssue('ab'), 'Username must be at least 3 characters.');
        assert.equal(usernameIssue('abc'), null);
        assert.equal(usernameIssue('a'.repeat(USERNAME_MAX_LENGTH)), null);
        assert.equal(usernameIssue('a'.repeat(USERNAME_MAX_LENGTH + 1)), 'Username cannot exceed 50 characters.');
    });
    it('allows letters, digits, dots, hyphens and underscores, starting with a letter or digit', () => {
        for (const ok of ['rahul', 'r.k-sharma_2', '9to5', 'a..b']) assert.equal(usernameIssue(ok), null, ok);
        for (const bad of ['.rahul', '-rahul', '_rahul', 'rahul sharma', 'rahul@x', 'राहुल', 'rahul/1']) {
            assert.match(usernameIssue(bad) ?? '', /^Use only letters/, bad);
        }
    });
    it('refuses names the CRM writes as its own actor (background jobs, seeds)', () => {
        for (const reserved of ['system', ' System ']) assert.match(usernameIssue(reserved) ?? '', /is reserved by the CRM/, reserved);
        assert.equal(usernameIssue('systems'), null);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, username: 'SYSTEM' }))?.path, ['username']);
    });
    it('reports the rule on the username field', () => {
        const issue = firstIssue(createUserSchema.safeParse({ ...base, username: 'a b' }));
        assert.deepEqual(issue?.path, ['username']);
        assert.match(issue?.message ?? '', /^Use only letters/);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, username: undefined }))?.path, ['username']);
    });
});

describe('createUserSchema', () => {
    it('name-cases names, tidies labels and clears blanks', () => {
        const parsed = createUserSchema.parse({
            ...base,
            lastName: ' ',
            role: '  Sales   Manager ',
            department: '',
            jobTitle: ' Inside  Sales Lead ',
            email: ' Palak@NandiniInfosys.com ',
            mobile: '98112 34567',
            officePhone: null,
        });
        assert.equal(parsed.firstName, 'Palak');
        assert.equal(parsed.lastName, null);
        assert.equal(parsed.role, 'Sales Manager');
        assert.equal(parsed.department, null);
        assert.equal(parsed.jobTitle, 'Inside Sales Lead');
        assert.equal(parsed.email, 'palak@nandiniinfosys.com');
        assert.equal(parsed.mobile, '+919811234567');
        assert.equal(parsed.officePhone, null);
        assert.equal(parsed.password, undefined);
    });
    it('requires a first name and a role', () => {
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, firstName: ' ' }))?.path, ['firstName']);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, role: '  ' }))?.path, ['role']);
        assert.equal(firstIssue(createUserSchema.safeParse({ ...base, role: 'x'.repeat(51) }))?.message, 'Role cannot exceed 50 characters.');
        assert.equal(firstIssue(createUserSchema.safeParse({ ...base, department: 'x'.repeat(51) }))?.message, 'Department cannot exceed 50 characters.');
        assert.equal(firstIssue(createUserSchema.safeParse({ ...base, jobTitle: 'x'.repeat(101) }))?.message, 'Job title cannot exceed 100 characters.');
    });
    it('checks email, phone, manager id and password shapes', () => {
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, email: 'nope' }))?.path, ['email']);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, mobile: '123' }))?.path, ['mobile']);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, reportsToId: 'abc' }))?.path, ['reportsToId']);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, reportsToId: 0 }))?.path, ['reportsToId']);
        assert.equal(createUserSchema.parse({ ...base, reportsToId: '' }).reportsToId, null);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, password: '' }))?.path, ['password']);
        assert.deepEqual(firstIssue(createUserSchema.safeParse({ ...base, password: 'a1'.repeat(65) }))?.path, ['password']);
    });
    it('refuses unknown keys (no setting isActive, mustChangePassword or a hash directly)', () => {
        for (const key of ['isActive', 'mustChangePassword', 'passwordHash', 'createdBy', 'id']) {
            const result = createUserSchema.safeParse({ ...base, [key]: true });
            assert.equal(result.success, false, key);
            assert.equal(result.error?.issues[0]?.code, 'unrecognized_keys', key);
        }
    });
});

describe('updateUserSchema', () => {
    it('accepts a partial body and leaves missing keys undefined', () => {
        assert.deepEqual(updateUserSchema.parse({}), {});
        assert.deepEqual(updateUserSchema.parse({ onLeave: true }), { onLeave: true });
        assert.deepEqual(updateUserSchema.parse({ email: '' }), { email: null });
        assert.deepEqual(updateUserSchema.parse({ reportsToId: null }), { reportsToId: null });
    });
    it('refuses a blank first name or role when sent', () => {
        assert.deepEqual(firstIssue(updateUserSchema.safeParse({ firstName: '' }))?.path, ['firstName']);
        assert.deepEqual(firstIssue(updateUserSchema.safeParse({ role: '' }))?.path, ['role']);
    });
    it('never changes the username or other server-owned columns', () => {
        for (const key of ['username', 'password', 'isActive', 'mustChangePassword', 'deactivatedAt']) {
            assert.equal(updateUserSchema.safeParse({ [key]: 'x' }).success, false, key);
        }
        assert.equal(updateUserSchema.safeParse({ onLeave: 'yes' }).success, false);
    });
});

describe('other schemas', () => {
    it('reset password: optional password, strict', () => {
        assert.deepEqual(resetPasswordSchema.parse({}), {});
        assert.deepEqual(resetPasswordSchema.parse({ password: 'Temp1234' }), { password: 'Temp1234' });
        assert.equal(resetPasswordSchema.safeParse({ password: 'Temp1234', notify: true }).success, false);
    });
    it('id param', () => {
        assert.deepEqual(userIdParamSchema.parse({ id: '12' }), { id: 12 });
        assert.equal(userIdParamSchema.safeParse({ id: 'x' }).success, false);
        assert.equal(userIdParamSchema.safeParse({ id: '0' }).success, false);
    });
    it('list query: defaults, caps and fallbacks', () => {
        assert.deepEqual(listUsersQuerySchema.parse({}), { status: 'active', page: 1, pageSize: 25 });
        const parsed = listUsersQuerySchema.parse({ search: '  asha  k ', status: 'all', role: 'Admin', page: '3', pageSize: '100' });
        assert.equal(parsed.search, 'asha k');
        assert.equal(parsed.status, 'all');
        assert.equal(parsed.page, 3);
        assert.equal(parsed.pageSize, 100);
        assert.equal(listUsersQuerySchema.parse({ pageSize: '500' }).pageSize, 25);
        assert.equal(listUsersQuerySchema.parse({ status: 'deleted' }).status, 'active');
        assert.equal(listUsersQuerySchema.parse({ search: '   ' }).search, undefined);
        assert.equal(listUsersQuerySchema.parse({ page: '-2' }).page, 1);
    });
});
