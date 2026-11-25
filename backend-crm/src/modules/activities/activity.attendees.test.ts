import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { canSetResponse, normalizeAttendees, planAttendeeSync, type NormalizedAttendee, type StoredAttendee } from './activity.attendees.js';
import { toAttendeeDto } from './activity.mapper.js';

const NOW = new Date('2026-11-25T06:30:00.000Z');
const EARLIER = new Date('2026-11-24T10:00:00.000Z');

const user = (username: string, extra: Partial<NormalizedAttendee> = {}): NormalizedAttendee => ({
    kind: 'user',
    username,
    contactId: null,
    email: null,
    name: username.toUpperCase(),
    ...extra,
});
const contact = (contactId: string, extra: Partial<NormalizedAttendee> = {}): NormalizedAttendee => ({
    kind: 'contact',
    username: null,
    contactId,
    email: null,
    name: `Contact ${contactId}`,
    ...extra,
});
const email = (address: string, extra: Partial<NormalizedAttendee> = {}): NormalizedAttendee => ({
    kind: 'email',
    username: null,
    contactId: null,
    email: address,
    name: address.split('@')[0],
    ...extra,
});

const stored = (attendee: NormalizedAttendee, id: string, sortOrder: number, extra: Partial<StoredAttendee> = {}): StoredAttendee => ({
    id,
    kind: attendee.kind,
    username: attendee.username,
    contactId: attendee.contactId,
    email: attendee.email,
    name: attendee.name,
    responseStatus: 'needsAction',
    respondedAt: null,
    sortOrder,
    ...extra,
});

describe('planAttendeeSync', () => {
    const ravi = user('ravi');
    const c1 = contact('c1');
    const ext = email('asha@acme.com');
    const previous = [stored(ravi, 'r1', 0, { responseStatus: 'accepted', respondedAt: EARLIER }), stored(c1, 'r2', 1), stored(ext, 'r3', 2)];

    it('writes nothing when the set is unchanged', () => {
        const plan = planAttendeeSync([ravi, c1, ext], previous, 'palak', NOW);
        assert.deepEqual(plan, { create: [], remove: [], update: [], setChanged: false });
    });

    it('matches identities ignoring the case of usernames and emails', () => {
        const plan = planAttendeeSync([user('RAVI', { name: 'RAVI' }), c1, email('ASHA@acme.com', { name: 'asha' })], previous, 'palak', NOW);
        assert.equal(plan.setChanged, false);
        assert.deepEqual(plan.create, []);
        assert.deepEqual(plan.remove, []);
    });

    it('adds and removes only what changed, keeping replies of those who stay', () => {
        const meera = user('meera');
        const plan = planAttendeeSync([ravi, meera], previous, 'palak', NOW);
        assert.deepEqual(plan.remove.sort(), ['r2', 'r3']);
        assert.deepEqual(plan.create, [
            { kind: 'user', username: 'meera', contactId: null, email: null, name: 'MEERA', responseStatus: 'needsAction', respondedAt: null, sortOrder: 1 },
        ]);
        assert.deepEqual(plan.update, []);
        assert.equal(plan.setChanged, true);
    });

    it('updates a kept row only for its name, email, order or an allowed reply', () => {
        const plan = planAttendeeSync([ext, { ...c1, name: 'Renamed', email: 'c1@acme.com' }, ravi], previous, 'palak', NOW);
        assert.equal(plan.setChanged, false);
        assert.deepEqual(plan.update, [
            { id: 'r3', data: { sortOrder: 0 } },
            { id: 'r2', data: { name: 'Renamed', email: 'c1@acme.com' } },
            { id: 'r1', data: { sortOrder: 2 } },
        ]);
    });

    it("records contacts' and emails' replies, but a colleague's only by that colleague", () => {
        const plan = planAttendeeSync(
            [{ ...ravi, responseStatus: 'declined' }, { ...c1, responseStatus: 'accepted' }, { ...ext, responseStatus: 'tentative' }],
            previous,
            'palak',
            NOW,
        );
        assert.deepEqual(plan.update, [
            { id: 'r2', data: { responseStatus: 'accepted', respondedAt: NOW } },
            { id: 'r3', data: { responseStatus: 'tentative', respondedAt: NOW } },
        ]);
        const own = planAttendeeSync([{ ...ravi, responseStatus: 'declined' }, c1, ext], previous, 'Ravi', NOW);
        assert.deepEqual(own.update, [{ id: 'r1', data: { responseStatus: 'declined', respondedAt: NOW } }]);
    });

    it('creates new contacts with the reply the owner recorded', () => {
        const plan = planAttendeeSync([{ ...contact('c9'), responseStatus: 'accepted' }, { ...user('meera'), responseStatus: 'accepted' }], [], 'palak', NOW);
        assert.equal(plan.create[0].responseStatus, 'accepted');
        assert.equal(plan.create[0].respondedAt, NOW);
        assert.equal(plan.create[1].responseStatus, 'needsAction');
        assert.equal(plan.create[1].respondedAt, null);
    });

    it('allows replies on behalf of contacts and emails, and own replies only', () => {
        assert.equal(canSetResponse({ kind: 'contact' }, 'palak'), true);
        assert.equal(canSetResponse({ kind: 'email' }, 'palak'), true);
        assert.equal(canSetResponse({ kind: 'user', username: 'ravi' }, 'palak'), false);
        assert.equal(canSetResponse({ kind: 'user', username: 'Ravi' }, 'ravi'), true);
    });
});

describe('normalizeAttendees', () => {
    function fakeTx(users: { username: string; fullName: string; isActive: boolean }[], contacts: { id: string; name: string; isDeleted: boolean }[]) {
        return {
            user: {
                async findMany(args: { where: { username: { in: string[] } } }) {
                    const wanted = new Set(args.where.username.in.map((u) => u.toLowerCase()));
                    return users.filter((u) => wanted.has(u.username.toLowerCase()));
                },
            },
            contact: {
                async findMany(args: { where: { id: { in: string[] } } }) {
                    return contacts.filter((c) => args.where.id.in.includes(c.id));
                },
            },
        } as unknown as TransactionClient;
    }
    const tx = fakeTx(
        [
            { username: 'ravi', fullName: 'Ravi Kumar', isActive: true },
            { username: 'old', fullName: '', isActive: false },
            { username: 'palak', fullName: 'Palak', isActive: true },
        ],
        [
            { id: 'c1', name: 'Asha Rao', isDeleted: false },
            { id: 'c2', name: 'Gone', isDeleted: true },
        ],
    );
    const isBadRequest = (err: unknown) => err instanceof HttpError && err.statusCode === 400;

    it('fills names and drops the owner', async () => {
        const result = await normalizeAttendees(
            tx,
            [
                { kind: 'user', username: 'RAVI' },
                { kind: 'user', username: 'Palak' },
                { kind: 'contact', contactId: 'c1' },
                { kind: 'email', email: 'meera@acme.com' },
            ],
            'palak',
        );
        assert.deepEqual(
            result.map((a) => [a.kind, a.username ?? a.contactId ?? a.email, a.name]),
            [
                ['user', 'ravi', 'Ravi Kumar'],
                ['contact', 'c1', 'Asha Rao'],
                ['email', 'meera@acme.com', 'meera'],
            ],
        );
    });

    it('refuses inactive users and deleted contacts unless already on the activity', async () => {
        await assert.rejects(normalizeAttendees(tx, [{ kind: 'user', username: 'old' }], 'palak'), isBadRequest);
        await assert.rejects(normalizeAttendees(tx, [{ kind: 'user', username: 'nobody' }], 'palak'), isBadRequest);
        await assert.rejects(normalizeAttendees(tx, [{ kind: 'contact', contactId: 'c2' }], 'palak'), isBadRequest);
        await assert.rejects(normalizeAttendees(tx, [{ kind: 'contact', contactId: 'zz' }], 'palak'), isBadRequest);

        const previous = [
            { id: 'a', kind: 'user', username: 'old', contactId: null, email: null, name: 'old', responseStatus: 'needsAction', respondedAt: null, sortOrder: 0 },
            { id: 'b', kind: 'contact', username: null, contactId: 'c2', email: null, name: 'Gone', responseStatus: 'needsAction', respondedAt: null, sortOrder: 1 },
        ];
        const kept = await normalizeAttendees(tx, [{ kind: 'user', username: 'old' }, { kind: 'contact', contactId: 'c2' }], 'palak', previous);
        assert.equal(kept.length, 2);
    });
});

describe('toAttendeeDto', () => {
    it('has no row id and leaves out keys without a value', () => {
        const dto = toAttendeeDto({ kind: 'contact', username: null, contactId: 'c1', email: null, name: 'Asha', responseStatus: 'needsAction', respondedAt: null });
        assert.deepEqual(dto, { kind: 'contact', contactId: 'c1', name: 'Asha', responseStatus: 'needsAction' });
        assert.ok(!('id' in dto));
        const replied = toAttendeeDto({ kind: 'user', username: 'ravi', contactId: null, email: null, name: 'Ravi', responseStatus: 'accepted', respondedAt: NOW });
        assert.deepEqual(replied, { kind: 'user', username: 'ravi', name: 'Ravi', responseStatus: 'accepted', respondedAt: NOW.toISOString() });
    });
});
