import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityUsernames, buildUserActivity, type DirectoryUser, type UserLastRow, type UserRangeRow } from './auditUsers.js';

const user = (username: string, extra: Partial<DirectoryUser> = {}): DirectoryUser => ({
    username,
    fullName: `Name of ${username}`,
    role: 'Sales Executive',
    department: 'Sales',
    email: `${username}@example.com`,
    isActive: true,
    isGroupUser: false,
    onLeave: false,
    lastLoginAt: null,
    ...extra,
});
const range = (changedBy: string, category: string, count: number, signIns = 0, failedSignIns = 0): UserRangeRow => ({ changedBy, category, count, signIns, failedSignIns });
const last = (username: string, at: string | null, action: string | null = 'UPDATE', module: string | null = 'leads'): UserLastRow => ({
    username,
    lastAt: at ? new Date(at) : null,
    action: at ? action : null,
    module: at ? module : null,
});
const format = (date: Date) => `at ${date.toISOString()}`;
const TODAY = '2026-11-26';

describe('activityUsernames', () => {
    it('looks up every user, the background jobs and anyone else active in the range, once each', () => {
        const names = activityUsernames([user('asha'), user('Ravi')], [range('ravi', 'DATA', 2), range('old.user', 'DATA', 1), range('system', 'DATA', 4)]);
        assert.deepEqual(names, ['asha', 'Ravi', 'system', 'old.user']);
    });
});

describe('buildUserActivity', () => {
    it('adds up the range per category, with sign-ins and failed sign-ins', () => {
        const [row] = buildUserActivity(
            [user('asha')],
            [range('asha', 'DATA', 10), range('asha', 'CONFIG', 2), range('asha', 'SECURITY', 5, 3, 2)],
            [last('asha', '2026-11-23T05:00:00Z')],
            TODAY,
            format,
        );
        assert.equal(row.total, 17);
        assert.equal(row.data, 10);
        assert.equal(row.config, 2);
        assert.equal(row.security, 5);
        assert.equal(row.signIns, 3);
        assert.equal(row.failedSignIns, 2);
        assert.equal(row.lastActivityAt, '2026-11-23T05:00:00.000Z');
        assert.equal(row.lastActivity, 'at 2026-11-23T05:00:00.000Z');
        assert.equal(row.lastActivityLabel, 'Updated · Leads');
    });

    it('keeps users with nothing in the range, and shows their status and last sign-in', () => {
        const rows = buildUserActivity(
            [user('asha'), user('meera', { isActive: false, lastLoginAt: new Date('2026-10-01T04:00:00Z') }), user('ravi', { onLeave: true })],
            [range('asha', 'DATA', 1)],
            [last('asha', '2026-11-23T05:00:00Z'), last('meera', '2026-10-01T04:00:00Z', 'LOGIN', 'auth'), last('ravi', null)],
            TODAY,
            format,
        );
        assert.deepEqual(
            rows.map((r) => [r.username, r.status, r.total]),
            [
                ['asha', 'active', 1],
                ['meera', 'inactive', 0],
                ['ravi', 'active', 0],
            ],
        );
        const meera = rows[1];
        assert.equal(meera.lastLogin, 'at 2026-10-01T04:00:00.000Z');
        assert.equal(meera.lastActivityLabel, 'Signed in · Auth');
        assert.equal(rows[2].onLeave, true);
        assert.equal(rows[2].lastActivityAt, null);
        assert.equal(rows[2].lastActivityLabel, null);
    });

    it('matches usernames regardless of case and names the row after the user list', () => {
        const [row] = buildUserActivity([user('Asha')], [range('ASHA', 'DATA', 3)], [last('asha', '2026-11-23T05:00:00Z')], TODAY, format);
        assert.equal(row.username, 'Asha');
        assert.equal(row.name, 'Name of Asha');
        assert.equal(row.total, 3);
    });

    it('lists the background jobs once they have entries, and usernames that are no longer users', () => {
        const rows = buildUserActivity([user('asha')], [range('system', 'DATA', 40), range('gone', 'DATA', 2)], [last('system', '2026-11-23T05:00:00Z', 'UPDATE', 'leads')], TODAY, format);
        assert.deepEqual(
            rows.map((r) => [r.username, r.name, r.status, r.role]),
            [
                ['system', 'System', 'system', 'Background jobs'],
                ['gone', 'gone', 'unknown', null],
                ['asha', 'Name of asha', 'active', 'Sales Executive'],
            ],
        );
        assert.equal(buildUserActivity([user('asha')], [], [last('system', null)], TODAY, format).length, 1);
    });

    it('gives users their profile photo URL, and none to the background jobs or former users', () => {
        const rows = buildUserActivity([user('asha', { photo: { id: 'p1' } }), user('ravi', { photo: null })], [range('system', 'DATA', 9), range('gone', 'DATA', 2)], [], TODAY, format);
        assert.deepEqual(
            rows.map((r) => [r.username, r.photoUrl]),
            [
                ['system', null],
                ['gone', null],
                ['asha', '/api/user-photos/p1'],
                ['ravi', null],
            ],
        );
    });

    it('gives users their out-of-office until it has ended, and none to the background jobs or former users', () => {
        const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
        const away = { outOfOfficeFrom: day('2026-12-01'), outOfOfficeTo: day('2026-12-05'), outOfOfficeMessage: 'At the Pune office' };
        const directory = [
            user('asha', { preference: away }),
            user('ravi', { preference: { outOfOfficeFrom: null, outOfOfficeTo: null, outOfOfficeMessage: null } }),
            user('meera', { preference: null }),
            user('dev'),
        ];
        const byName = (rows: ReturnType<typeof buildUserActivity>) => Object.fromEntries(rows.map((r) => [r.username, r.outOfOffice]));
        const expected = { from: '2026-12-01', to: '2026-12-05', message: 'At the Pune office' };
        assert.deepEqual(byName(buildUserActivity(directory, [range('system', 'DATA', 1), range('gone', 'DATA', 1)], [], TODAY, format)), {
            asha: expected,
            ravi: null,
            meera: null,
            dev: null,
            system: null,
            gone: null,
        });
        assert.deepEqual(byName(buildUserActivity(directory, [], [], '2026-12-05', format)).asha, expected);
        assert.equal(byName(buildUserActivity(directory, [], [], '2026-12-06', format)).asha, null);
        const noMessage = { ...away, outOfOfficeMessage: null };
        assert.deepEqual(byName(buildUserActivity([user('asha', { preference: noMessage })], [], [], TODAY, format)).asha, { ...expected, message: null });
    });

    it('leaves out group accounts that never did anything', () => {
        const rows = buildUserActivity([user('asha'), user('sales-team', { isGroupUser: true }), user('support-team', { isGroupUser: true })], [range('support-team', 'DATA', 1)], [], TODAY, format);
        assert.deepEqual(
            rows.map((r) => r.username),
            ['support-team', 'asha'],
        );
    });

    it('sorts the most active first, then the most recently active, then by name', () => {
        const rows = buildUserActivity(
            [user('c', { fullName: 'Chitra' }), user('b', { fullName: 'Bala' }), user('a', { fullName: 'Anil' }), user('d', { fullName: 'Dev' })],
            [range('d', 'DATA', 5)],
            [last('c', '2026-11-20T05:00:00Z'), last('b', '2026-11-22T05:00:00Z'), last('d', '2026-11-01T05:00:00Z')],
            TODAY,
            format,
        );
        assert.deepEqual(
            rows.map((r) => r.name),
            ['Dev', 'Bala', 'Chitra', 'Anil'],
        );
    });
});
