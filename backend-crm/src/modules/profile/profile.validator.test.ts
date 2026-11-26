import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { photoIdParamSchema, photoUploadSchema, profileUpdateSchema, sessionIdParamSchema } from './profile.validator.js';

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string; code: string }[] } }) =>
    result.error?.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message, code: issue.code })) ?? [];

describe('profileUpdateSchema', () => {
    it('accepts an empty body and leaves every field unchanged', () => {
        const input = profileUpdateSchema.parse({});
        assert.equal(input.firstName, undefined);
        assert.equal(input.lastName, undefined);
        assert.equal(input.mobile, undefined);
        assert.equal(input.officePhone, undefined);
    });

    it('refuses keys the user may not change', () => {
        for (const key of ['role', 'department', 'email', 'username', 'fullName', 'phone', 'isActive']) {
            const result = profileUpdateSchema.safeParse({ firstName: 'Palak', [key]: 'x' });
            assert.equal(result.success, false, key);
            assert.equal(issues(result)[0]?.code, 'unrecognized_keys', key);
        }
    });

    it('name-cases first and last names like other person names', () => {
        const input = profileUpdateSchema.parse({ firstName: '  rajesh ', lastName: 'KUMAR sharma' });
        assert.equal(input.firstName, 'Rajesh');
        assert.equal(input.lastName, 'Kumar Sharma');
        assert.equal(profileUpdateSchema.parse({ firstName: 'ca rajesh' }).firstName, 'CA Rajesh');
    });

    it('requires a first name when it is sent', () => {
        for (const firstName of ['', '   ', null]) {
            const result = profileUpdateSchema.safeParse({ firstName });
            assert.equal(result.success, false, JSON.stringify(firstName));
            assert.deepEqual(
                issues(result).map(({ path, message }) => ({ path, message })),
                [{ path: 'firstName', message: 'First Name is required.' }],
            );
        }
    });

    it('limits names to 100 characters', () => {
        const result = profileUpdateSchema.safeParse({ firstName: 'a'.repeat(101), lastName: 'b'.repeat(101) });
        assert.deepEqual(
            issues(result).map(({ path, message }) => ({ path, message })),
            [
                { path: 'firstName', message: 'First Name cannot exceed 100 characters.' },
                { path: 'lastName', message: 'Last Name cannot exceed 100 characters.' },
            ],
        );
    });

    it("turns '' / null into null (clear) for the optional fields", () => {
        const input = profileUpdateSchema.parse({ lastName: '  ', mobile: '', officePhone: null });
        assert.equal(input.lastName, null);
        assert.equal(input.mobile, null);
        assert.equal(input.officePhone, null);
    });

    it('normalizes phones to E.164 and refuses invalid ones', () => {
        const input = profileUpdateSchema.parse({ mobile: '98112 34567', officePhone: '+91 11 2345 6789' });
        assert.equal(input.mobile, '+919811234567');
        assert.equal(input.officePhone, '+911123456789');

        const result = profileUpdateSchema.safeParse({ mobile: '12345', officePhone: 'call me' });
        assert.deepEqual(
            issues(result).map(({ path }) => path),
            ['mobile', 'officePhone'],
        );
        assert.match(issues(result)[0].message, /^Mobile must be a valid phone number/);
        assert.match(issues(result)[1].message, /^Office Phone must be a valid phone number/);
    });
});

describe('photoUploadSchema', () => {
    it('needs a type and data; the file name is optional', () => {
        assert.deepEqual(photoUploadSchema.parse({ mimeType: 'image/webp', data: 'AAAA' }), { mimeType: 'image/webp', data: 'AAAA' });
        assert.equal(photoUploadSchema.safeParse({ mimeType: 'image/webp', data: '' }).success, false);
        assert.equal(photoUploadSchema.safeParse({ data: 'AAAA' }).success, false);
    });
});

describe('id params', () => {
    it('take UUIDs only', () => {
        const id = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e';
        assert.deepEqual(sessionIdParamSchema.parse({ id }), { id });
        assert.deepEqual(photoIdParamSchema.parse({ id }), { id });
        assert.equal(sessionIdParamSchema.safeParse({ id: 'abc' }).success, false);
        assert.equal(photoIdParamSchema.safeParse({ id: '../etc/passwd' }).success, false);
    });
});
