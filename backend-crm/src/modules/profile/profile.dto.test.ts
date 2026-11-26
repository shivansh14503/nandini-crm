import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SessionRecord } from '../auth/sessionRecord.js';
import { joinFullName, resolveNameParts, splitFullName, photoUrlOf, profileAuditSnapshot, toAuthMeDto, toProfileDto, toSessionDtos, type ProfileRow } from './profile.dto.js';

const row: ProfileRow = {
    id: 7,
    username: 'palak',
    firstName: 'Palak',
    lastName: 'Sharma',
    fullName: 'Palak Sharma',
    email: 'palak@example.com',
    role: 'Sales Executive',
    department: 'Sales',
    phone: '+919811234567',
    officePhone: null,
    lastLoginAt: new Date('2026-11-26T04:30:00.000Z'),
    passwordChangedAt: null,
    createdAt: new Date('2025-04-01T00:00:00.000Z'),
    photo: { id: 'a1b2c3d4-0000-4000-8000-000000000001' },
};

describe('toProfileDto', () => {
    it('maps the row, phone as mobile, dates as ISO strings and the photo as a URL', () => {
        assert.deepEqual(toProfileDto(row), {
            id: 7,
            username: 'palak',
            firstName: 'Palak',
            lastName: 'Sharma',
            fullName: 'Palak Sharma',
            email: 'palak@example.com',
            role: 'Sales Executive',
            department: 'Sales',
            mobile: '+919811234567',
            officePhone: null,
            photoUrl: '/api/user-photos/a1b2c3d4-0000-4000-8000-000000000001',
            lastLoginAt: '2026-11-26T04:30:00.000Z',
            passwordChangedAt: null,
            createdAt: '2025-04-01T00:00:00.000Z',
        });
    });

    it('gives null for a missing photo and dates', () => {
        const dto = toProfileDto({ ...row, photo: null, lastLoginAt: null, passwordChangedAt: new Date('2026-11-20T10:00:00.000Z') });
        assert.equal(dto.photoUrl, null);
        assert.equal(dto.lastLoginAt, null);
        assert.equal(dto.passwordChangedAt, '2026-11-20T10:00:00.000Z');
    });

    it('never exposes the password hash, even if a row carries one', () => {
        const dto = toProfileDto({ ...row, passwordHash: 'secret' } as ProfileRow);
        assert.equal('passwordHash' in dto, false);
    });
});

describe('toAuthMeDto', () => {
    it('adds photoUrl and keeps the names', () => {
        const base = { id: 7, username: 'palak', role: 'Admin', fullName: 'Palak Sharma', firstName: 'Palak', lastName: 'Sharma' };
        assert.deepEqual(toAuthMeDto({ ...base, photo: { id: 'p1' } }), { ...base, photoUrl: '/api/user-photos/p1' });
        assert.deepEqual(toAuthMeDto({ ...base, photo: null }), { ...base, photoUrl: null });
    });
});

describe('helpers', () => {
    it('photoUrlOf encodes the id and is null without one', () => {
        assert.equal(photoUrlOf('a b'), '/api/user-photos/a%20b');
        assert.equal(photoUrlOf(null), null);
        assert.equal(photoUrlOf(''), null);
    });

    it('joinFullName trims and skips a missing last name', () => {
        assert.equal(joinFullName('Palak', 'Sharma'), 'Palak Sharma');
        assert.equal(joinFullName(' Palak ', null), 'Palak');
        assert.equal(joinFullName('Palak', '  '), 'Palak');
        assert.equal(joinFullName(null, null), '');
    });

    it('splitFullName splits at the first space, like the migration backfill', () => {
        assert.deepEqual(splitFullName('Palak Sharma'), { firstName: 'Palak', lastName: 'Sharma' });
        assert.deepEqual(splitFullName('  Rajesh  Kumar Sharma '), { firstName: 'Rajesh', lastName: 'Kumar Sharma' });
        assert.deepEqual(splitFullName('Administrator'), { firstName: 'Administrator', lastName: null });
        assert.deepEqual(splitFullName('   '), { firstName: null, lastName: null });
        assert.deepEqual(splitFullName(null), { firstName: null, lastName: null });
    });

    it('profileAuditSnapshot names the phone column mobile', () => {
        assert.deepEqual(profileAuditSnapshot(row), { firstName: 'Palak', lastName: 'Sharma', fullName: 'Palak Sharma', mobile: '+919811234567', officePhone: null });
    });
});

describe('toSessionDtos', () => {
    const record = (jti: string, createdAt: string | null, userAgent: string | null = null): SessionRecord => ({
        jti,
        ip: '10.0.0.5',
        userAgent,
        createdAt,
        expiresAt: '2026-11-26T18:00:00.000Z',
    });

    it('puts the current session first, then newest, unknown times last', () => {
        const dtos = toSessionDtos(
            [record('old', '2026-11-20T09:00:00.000Z'), record('none', null), record('me', '2026-11-19T09:00:00.000Z'), record('new', '2026-11-26T09:00:00.000Z')],
            'me',
        );
        assert.deepEqual(
            dtos.map((dto) => [dto.id, dto.current]),
            [
                ['me', true],
                ['new', false],
                ['old', false],
                ['none', false],
            ],
        );
    });

    it('describes the device and keeps the details', () => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        assert.deepEqual(toSessionDtos([record('s1', '2026-11-26T09:00:00.000Z', ua)], undefined), [
            {
                id: 's1',
                current: false,
                ip: '10.0.0.5',
                userAgent: ua,
                device: 'Chrome on Windows',
                createdAt: '2026-11-26T09:00:00.000Z',
                expiresAt: '2026-11-26T18:00:00.000Z',
            },
        ]);
        assert.equal(toSessionDtos([record('s2', null)], 'x')[0].device, 'Unknown device');
    });
});

describe('resolveNameParts', () => {
    it('keeps stored names that add up to fullName', () => {
        assert.deepEqual(resolveNameParts({ firstName: 'Palak', lastName: 'Sharma', fullName: 'Palak Sharma' }), { firstName: 'Palak', lastName: 'Sharma' });
    });

    it('splits fullName for a user created outside the app (no parts stored)', () => {
        assert.deepEqual(resolveNameParts({ firstName: null, lastName: null, fullName: 'Rahul Sharma' }), { firstName: 'Rahul', lastName: 'Sharma' });
    });

    it('splits fullName when it was renamed outside the app', () => {
        assert.deepEqual(resolveNameParts({ firstName: 'Rahul', lastName: 'Sharma', fullName: 'Rahul K Sharma' }), { firstName: 'Rahul', lastName: 'K Sharma' });
    });

    it('keeps the stored parts when fullName is blank', () => {
        assert.deepEqual(resolveNameParts({ firstName: null, lastName: null, fullName: '' }), { firstName: null, lastName: null });
    });

    it('is applied by toProfileDto and toAuthMeDto', () => {
        assert.equal(toProfileDto({ ...row, firstName: null, lastName: null }).lastName, 'Sharma');
        const me = toAuthMeDto({ id: 7, username: 'palak', role: 'Admin', fullName: 'Palak Sharma', firstName: null, lastName: null, photo: null });
        assert.equal(me.firstName, 'Palak');
    });
});
