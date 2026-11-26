import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ENV } from '../../config/env.js';
import type { Activity } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { runInTransaction } from '../shared/transactions.js';
import { activityLocks, lockedFieldsFor, type ActivityLock } from './activity.access.js';
import { computeRemindAt } from './activity.schedule.js';
import { activityService, runActivityPostCommit, type ActivityConfig } from './activity.service.js';
import { activityWriteHook, applySystemPatch, insertSystemActivity, loadFollowUpContext, type ActivityWriteEvent } from './activity.system.js';
import { blankActivity, blankAttendee, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from './testing/activityDouble.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Whole minutes, so instants round-trip through the API's ISO strings. */
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);

/** An Activities config with no admin fields and no Followup Type list (module defaults). */
const CONFIG: ActivityConfig = { fields: { module: 'activities', fields: [], activeOptions: new Map() }, followupTypes: null };

/** The same, with an admin-required Location (a CRM save without one is refused). */
const REQUIRED_LOCATION = {
    categories: [],
    fieldsByModule: {
        activities: [{ id: 'f1', fieldKey: 'location', label: 'Location', fieldType: 'text', isSystem: true, isActive: true, isVisibleInForm: true, isRequired: true, isDeleted: false }],
    },
    moduleTabs: {},
    moduleSettings: {},
} as unknown as FormConfigsPayload;

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };

const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true },
    { username: 'asha', fullName: 'Asha Rao', isActive: true },
    { username: 'ravi', fullName: 'Ravi Kumar', isActive: false },
    { username: 'meena', fullName: 'Meena Iyer', isActive: false },
];

/** A lead owned by someone else than the actor (a CRM save by palak couldn't pick it). */
const LEAD = { id: 'l1', leadCode: 'LD-0012', name: 'Sunrise Hotels', organizationName: 'SUNRISE HOTELS', assignedTo: 'ravi', createdBy: 'ravi', isDeleted: false };

/** Records every write-hook call with whether it ran inside the open transaction. */
function captureHook(state: ActivityDoubleState) {
    const calls: { event: ActivityWriteEvent; inTx: boolean }[] = [];
    mock.method(activityWriteHook, 'onWrite', async (tx: object, event: ActivityWriteEvent) => {
        calls.push({ event, inTx: tx === state.openTx && state.openTx !== null });
    });
    return calls;
}

const stubLock = (lock: ActivityLock | null, ids?: string[]) =>
    mock.method(activityLocks, 'lockFor', (row: Activity) => (!ids || ids.includes(row.id) ? lock : null));

const FOLLOW_UP_LOCK: ActivityLock = {
    fields: ['followupType', 'startAt', 'endAt', 'allDay', 'status', 'assignedTo', 'relatedModule', 'relatedId', 'relatedTo'],
    code: 'FOLLOW_UP_ACTIVITY_LOCKED',
    message: "This is the lead's next follow-up. Change it on the lead (LD-0012).",
    deleteRefusedReason: 'Next follow-up of LD-0012: change it on the lead',
};

const rejectsWith = (status: number, code?: string) => (err: unknown) => {
    assert.ok(err instanceof HttpError, String(err));
    assert.equal(err.statusCode, status, err.message);
    if (code) assert.equal(err.code, code);
    return true;
};

afterEach(() => restoreActivityDouble());

describe('insertSystemActivity', () => {
    it('stores the owner verbatim and skips the active-user, past-start, admin-required and related-access checks', async () => {
        const state = installActivityDouble({ users: USERS, leads: [LEAD], configs: REQUIRED_LOCATION });
        const hook = captureHook(state);
        const now = new Date();
        const start = inDays(-2); // in the past: a CRM save of a Planned activity is refused
        const commit = await runInTransaction((tx) =>
            insertSystemActivity(
                tx,
                {
                    followupType: 'Call',
                    subject: 'Call follow-up: LD-0012 Sunrise Hotels',
                    assignedTo: 'ravi', // deactivated
                    relatedModule: 'leads',
                    relatedId: 'l1',
                    startAt: start.toISOString(),
                    reminder: '15 minutes before',
                },
                'palak',
                now,
                { activityConfig: CONFIG, createdBy: 'ravi', notify: false },
            ),
        );

        const row = commit.after;
        assert.equal(commit.before, null);
        assert.equal(commit.notify, false);
        assert.equal(row.assignedTo, 'ravi');
        assert.equal(row.createdBy, 'ravi');
        assert.equal(row.status, 'Planned');
        assert.equal(row.startAt?.getTime(), start.getTime());
        assert.equal(row.endAt?.getTime(), start.getTime() + 30 * 60_000, 'fallback duration from the passed config');
        assert.equal(row.relatedCode, 'LD-0012');
        assert.equal(row.relatedTo, 'Sunrise Hotels');
        assert.equal(row.organizationName, 'SUNRISE HOTELS');
        assert.equal(row.timeZone, ENV.BUSINESS_TIMEZONE);
        assert.equal(row.revision, 0);
        assert.equal(row.remindAt?.getTime(), start.getTime() - 15 * 60_000);
        assert.equal(state.calls.includes('user.findFirst'), false, 'no active-assignee lookup');
        assert.deepEqual(
            state.audits.map((a) => [a.entityType, a.action, a.entityId, a.changedBy]),
            [['Activity', 'CREATE', row.id, 'palak']],
        );
        assert.equal((state.audits[0].changes as Record<string, unknown>).assignedTo, 'ravi');

        assert.equal(hook.length, 1);
        assert.equal(hook[0].inTx, true);
        assert.deepEqual(hook[0].event, { before: null, after: row, actor: 'palak', now, markSync: true, config: CONFIG });

        // The same activity as a CRM save fails on the very checks the system path skips.
        await assert.rejects(
            activityService.create(
                { followupType: 'Call', subject: 'x', assignedTo: 'palak', relatedModule: 'leads', relatedId: 'l1', startAt: inDays(1).toISOString(), location: 'Pune' },
                PALAK,
            ),
            rejectsWith(403),
        );
        await assert.rejects(
            activityService.create({ followupType: 'Call', subject: 'x', assignedTo: 'ravi', startAt: inDays(1).toISOString(), location: 'Pune' }, PALAK),
            rejectsWith(400),
        );
        await assert.rejects(activityService.create({ followupType: 'Call', subject: 'x', assignedTo: 'palak', startAt: start.toISOString(), location: 'Pune' }, PALAK), rejectsWith(400));
        await assert.rejects(activityService.create({ followupType: 'Call', subject: 'x', assignedTo: 'palak', startAt: inDays(1).toISOString() }, PALAK), rejectsWith(400));
        assert.equal(state.activities.length, 1);
    });

    it('still refuses a related record that no longer exists or was deleted', async () => {
        installActivityDouble({ users: USERS, leads: [{ ...LEAD, isDeleted: true }] });
        const insert = (relatedId: string) =>
            runInTransaction((tx) =>
                insertSystemActivity(tx, { followupType: 'Call', subject: 'x', assignedTo: 'ravi', relatedModule: 'leads', relatedId, startAt: inDays(1).toISOString() }, 'palak', new Date(), {
                    activityConfig: CONFIG,
                }),
            );
        await assert.rejects(insert('l1'), rejectsWith(400));
        await assert.rejects(insert('missing'), rejectsWith(400));
    });

    it('stores attendees (owner dropped) and passes markSync: false and createdBy defaulting to the actor', async () => {
        const state = installActivityDouble({ users: USERS });
        const hook = captureHook(state);
        const { after } = await runInTransaction((tx) =>
            insertSystemActivity(
                tx,
                {
                    followupType: 'Meeting',
                    subject: 'Review',
                    assignedTo: 'palak',
                    startAt: inDays(3).toISOString(),
                    attendees: [
                        { kind: 'user', username: 'asha' },
                        { kind: 'user', username: 'palak' },
                        { kind: 'email', email: 'Buyer@Customer.com', responseStatus: 'accepted' },
                    ],
                },
                'asha',
                new Date(),
                { activityConfig: CONFIG, markSync: false },
            ),
        );
        assert.equal(after.createdBy, 'asha');
        assert.deepEqual(
            after.attendees.map((a) => [a.kind, a.username ?? a.email, a.name, a.responseStatus, a.sortOrder]),
            [
                ['user', 'asha', 'Asha Rao', 'needsAction', 0],
                ['email', 'buyer@customer.com', 'buyer', 'accepted', 1],
            ],
        );
        assert.equal(hook.length, 1);
        assert.equal(hook[0].event.markSync, false);
    });

    it('is rolled back with the transaction when the write hook throws (it runs inside it)', async () => {
        const state = installActivityDouble({ users: USERS });
        mock.method(activityWriteHook, 'onWrite', async () => {
            throw new Error('outbox failed');
        });
        await assert.rejects(
            runInTransaction((tx) =>
                insertSystemActivity(tx, { followupType: 'Call', subject: 'x', assignedTo: 'palak', startAt: inDays(1).toISOString() }, 'palak', new Date(), { activityConfig: CONFIG }),
            ),
            /outbox failed/,
        );
        assert.equal(state.activities.length, 0);
        assert.equal(state.audits.length, 0);
    });
});

describe('applySystemPatch', () => {
    const START = inDays(2);
    const seedActivity = (over: Partial<Activity> = {}) =>
        blankActivity({
            id: 'a1',
            subject: 'Call follow-up: LD-0012 Sunrise Hotels',
            followupType: 'Call',
            assignedTo: 'ravi', // deactivated owner
            createdBy: 'ravi',
            startAt: START,
            endAt: new Date(START.getTime() + 30 * 60_000),
            reminder: '15 minutes before',
            remindAt: new Date(START.getTime() - 15 * 60_000),
            reminderSentAt: new Date(START.getTime() - 15 * 60_000),
            ...over,
        });

    it('moves the activity: verbatim owner, no past check, audit, revision, remindAt re-armed, hook once', async () => {
        const state = installActivityDouble({ users: USERS, activities: [seedActivity()] });
        const hook = captureHook(state);
        const newStart = inDays(-1); // into the past
        const now = new Date();
        const commit = await runInTransaction((tx) =>
            applySystemPatch(tx, 'a1', { startAt: newStart.toISOString(), endAt: '', assignedTo: 'meena' }, 'palak', now, {
                activityConfig: CONFIG,
                markSync: false,
                notify: true,
            }),
        );
        const { before, after } = commit;
        assert.equal(commit.notify, true);
        assert.equal(before?.startAt?.getTime(), START.getTime());
        assert.equal(after.assignedTo, 'meena', 'inactive new owner taken verbatim');
        assert.equal(after.startAt?.getTime(), newStart.getTime());
        assert.equal(after.endAt?.getTime(), newStart.getTime() + 30 * 60_000);
        assert.equal(after.revision, 1);
        assert.equal(after.updatedBy, 'palak');
        assert.equal(after.remindAt?.getTime(), computeRemindAt({ ...after, isDeleted: false }, ENV.BUSINESS_TIMEZONE)?.getTime());
        assert.equal(after.reminderSentAt, null, 'a reschedule re-arms the reminder');
        assert.deepEqual(state.locks, ['activity:id:a1']);
        assert.equal(state.calls.includes('user.findFirst'), false);
        assert.equal(state.audits.length, 1);
        assert.equal(state.audits[0].action, 'UPDATE');
        assert.equal(state.audits[0].changedBy, 'palak');
        assert.deepEqual(Object.keys(state.audits[0].changes as object).sort(), ['assignedTo', 'endAt', 'startAt']);

        assert.equal(hook.length, 1);
        assert.equal(hook[0].inTx, true);
        assert.deepEqual(hook[0].event, { before, after, actor: 'palak', now, markSync: false, config: CONFIG });
    });

    it('syncs attendees by identity, keeping replies, and bumps the revision', async () => {
        const state = installActivityDouble({
            users: USERS,
            activities: [seedActivity({ assignedTo: 'palak' })],
            attendees: [
                blankAttendee({ activityId: 'a1', kind: 'user', username: 'asha', name: 'Asha Rao', responseStatus: 'accepted', respondedAt: new Date(), sortOrder: 0 }),
                blankAttendee({ activityId: 'a1', kind: 'email', email: 'old@customer.com', name: 'old', sortOrder: 1 }),
            ],
        });
        const { after } = await runInTransaction((tx) =>
            applySystemPatch(
                tx,
                'a1',
                {
                    attendees: [
                        { kind: 'email', email: 'new@customer.com', name: 'New Buyer' },
                        { kind: 'user', username: 'asha' },
                    ],
                },
                'palak',
                new Date(),
                { activityConfig: CONFIG },
            ),
        );
        assert.deepEqual(
            after.attendees.map((a) => [a.username ?? a.email, a.responseStatus, a.sortOrder]),
            [
                ['new@customer.com', 'needsAction', 0],
                ['asha', 'accepted', 1],
            ],
        );
        assert.equal(after.revision, 1);
        assert.equal(state.attendees.some((a) => a.email === 'old@customer.com'), false);
    });

    it('writes no audit entry and keeps the revision when nothing changes (the hook still runs once)', async () => {
        const state = installActivityDouble({ users: USERS, activities: [seedActivity()] });
        const hook = captureHook(state);
        const { after } = await runInTransaction((tx) => applySystemPatch(tx, 'a1', { subject: 'Call follow-up: LD-0012 Sunrise Hotels' }, 'palak', new Date(), { activityConfig: CONFIG }));
        assert.equal(after.revision, 0);
        assert.equal(state.audits.length, 0);
        assert.equal(hook.length, 1);
    });

    it('is not subject to locks (callers decide)', async () => {
        const state = installActivityDouble({ users: USERS, activities: [seedActivity()] });
        stubLock(FOLLOW_UP_LOCK);
        const { after } = await runInTransaction((tx) => applySystemPatch(tx, 'a1', { startAt: inDays(5).toISOString(), endAt: '', status: 'Cancelled' }, 'palak', new Date(), { activityConfig: CONFIG }));
        assert.equal(after.status, 'Cancelled');
        assert.equal(after.remindAt, null);
        assert.equal(state.audits.length, 1);
    });

    it('answers 404 for a deleted or missing activity', async () => {
        installActivityDouble({ users: USERS, activities: [seedActivity({ isDeleted: true })] });
        for (const id of ['a1', 'nope']) {
            await assert.rejects(
                runInTransaction((tx) => applySystemPatch(tx, id, { subject: 'x' }, 'palak', new Date(), { activityConfig: CONFIG })),
                rejectsWith(404),
            );
        }
    });
});

describe('loadFollowUpContext', () => {
    it('loads the activity config and the calendar settings from the cached form configuration', async () => {
        installActivityDouble();
        const context = await loadFollowUpContext();
        assert.equal(context.activityConfig.fields.module, 'activities');
        assert.equal(context.calendarSettings.followUpActivities, true);
    });
});

describe('activity locks (seam for P2-4 / P2-8)', () => {
    const START = inDays(2);
    const rows = () => [
        blankActivity({ id: 'a1', subject: 'Locked', assignedTo: 'palak', createdBy: 'palak', startAt: START, endAt: new Date(START.getTime() + HOUR) }),
        blankActivity({ id: 'a2', subject: 'Free', assignedTo: 'palak', createdBy: 'palak', startAt: START, endAt: new Date(START.getTime() + HOUR) }),
    ];

    it('lockedFieldsFor is empty for every Phase 1 activity', () => {
        assert.deepEqual(lockedFieldsFor(rows()[0]), []);
        stubLock(FOLLOW_UP_LOCK);
        assert.deepEqual(lockedFieldsFor(rows()[0]), [...FOLLOW_UP_LOCK.fields]);
    });

    it('update refuses a change to a locked field with 409 and writes nothing; other fields and unchanged values pass', async () => {
        const state = installActivityDouble({ users: USERS, activities: rows() });
        const hook = captureHook(state);
        stubLock(FOLLOW_UP_LOCK, ['a1']);
        await assert.rejects(activityService.update('a1', { status: 'Cancelled' }, PALAK), (err: unknown) => {
            rejectsWith(409, 'FOLLOW_UP_ACTIVITY_LOCKED')(err);
            assert.deepEqual((err as HttpError).errors?.map((e) => e.path), [['status']]);
            return true;
        });
        assert.equal(state.activities[0].status, 'Planned');
        assert.equal(state.audits.length, 0);
        assert.equal(hook.length, 0);

        const saved = await activityService.update('a1', { subject: 'Renamed', status: 'Planned', startAt: START.toISOString() }, PALAK);
        assert.equal(saved.subject, 'Renamed');
        const free = await activityService.update('a2', { status: 'Cancelled' }, PALAK);
        assert.equal(free.status, 'Cancelled');
        assert.equal(hook.length, 2);
    });

    it('remove refuses a locked activity that refuses deletion; a lock that allows deletion lets it go', async () => {
        const state = installActivityDouble({ users: USERS, activities: rows() });
        stubLock(FOLLOW_UP_LOCK, ['a1']);
        await assert.rejects(activityService.remove('a1', PALAK), rejectsWith(409, 'FOLLOW_UP_ACTIVITY_LOCKED'));
        assert.equal(state.activities[0].isDeleted, false);
        assert.equal(state.audits.length, 0);

        mock.restoreAll();
        installActivityDouble({ users: USERS, activities: rows() });
        stubLock({ ...FOLLOW_UP_LOCK, code: 'EXTERNAL_EVENT_LOCKED', deleteRefusedReason: null }, ['a1']);
        await activityService.remove('a1', PALAK);
    });

    it('bulkRemove skips locked activities with their reason and deletes the rest', async () => {
        const state = installActivityDouble({ users: USERS, activities: rows() });
        const hook = captureHook(state);
        stubLock(FOLLOW_UP_LOCK, ['a1']);
        const result = await activityService.bulkRemove(['a1', 'a2', 'gone'], PALAK);
        assert.deepEqual(result, { deleted: 1, ids: ['a2'], notFound: ['gone'], skipped: [{ id: 'a1', reason: FOLLOW_UP_LOCK.deleteRefusedReason }] });
        assert.deepEqual(
            state.activities.map((a) => [a.id, a.isDeleted]),
            [
                ['a1', false],
                ['a2', true],
            ],
        );
        assert.deepEqual(
            state.audits.map((a) => [a.action, a.entityId]),
            [['DELETE', 'a2']],
        );
        assert.deepEqual(
            hook.map((h) => h.event.after.id),
            ['a2'],
        );
    });
});

describe('deletes (unchanged results; the write hook and a harmless post-commit step now run)', () => {
    const START = inDays(2);
    const seed = () => [
        blankActivity({ id: 'a1', subject: 'One', assignedTo: 'palak', createdBy: 'palak', startAt: START, reminder: '15 minutes before', remindAt: new Date(START.getTime() - 15 * 60_000) }),
        blankActivity({ id: 'a2', subject: 'Two', assignedTo: 'asha', createdBy: 'palak', startAt: START }),
    ];

    it('remove: soft delete, reminder cleared, DELETE audit, hook once in the transaction, nobody notified', async () => {
        const state = installActivityDouble({ users: USERS, activities: seed() });
        const hook = captureHook(state);
        assert.equal(await activityService.remove('a1', PALAK), undefined);
        const row = state.activities[0];
        assert.equal(row.isDeleted, true);
        assert.equal(row.remindAt, null);
        assert.equal(row.updatedBy, 'palak');
        assert.deepEqual(state.audits, [{ entityType: 'Activity', entityId: 'a1', action: 'DELETE', changedBy: 'palak' }]);
        assert.deepEqual(state.invalidated, ['activities']);
        assert.equal(hook.length, 1);
        assert.equal(hook[0].inTx, true);
        assert.equal(hook[0].event.before?.isDeleted, false);
        assert.equal(hook[0].event.after.isDeleted, true);
        assert.equal(hook[0].event.actor, 'palak');
        assert.equal(hook[0].event.config, null);
        // The post-commit step reads nothing and tells nobody for a deleted row.
        assert.equal(state.calls.includes('user.findMany'), false);
    });

    it('bulkRemove: same result shape as before (no `skipped` key), one hook call per deleted row', async () => {
        const state = installActivityDouble({ users: USERS, activities: seed() });
        const hook = captureHook(state);
        const result = await activityService.bulkRemove(['a1', 'a2', 'gone'], PALAK);
        assert.deepEqual(result, { deleted: 2, ids: ['a1', 'a2'], notFound: ['gone'] });
        assert.equal('skipped' in result, false);
        assert.deepEqual(
            state.audits.map((a) => [a.action, a.entityId, a.changedBy]),
            [
                ['DELETE', 'a1', 'palak'],
                ['DELETE', 'a2', 'palak'],
            ],
        );
        assert.equal(state.activities.every((a) => a.isDeleted && a.remindAt === null), true);
        assert.deepEqual(
            hook.map((h) => [h.event.after.id, h.event.before?.isDeleted, h.event.after.isDeleted, h.inTx]),
            [
                ['a1', false, true, true],
                ['a2', false, true, true],
            ],
        );
        assert.equal(state.calls.includes('user.findMany'), false);
    });

    it('bulkRemove of nothing live: no write, no cache invalidation', async () => {
        const state = installActivityDouble({ users: USERS, activities: seed() });
        assert.deepEqual(await activityService.bulkRemove(['gone'], PALAK), { deleted: 0, ids: [], notFound: ['gone'] });
        assert.deepEqual(state.invalidated, []);
        assert.equal(state.audits.length, 0);
    });

    it('a non-owner is refused before anything is deleted (403, unchanged)', async () => {
        const state = installActivityDouble({ users: USERS, activities: seed() });
        const asha: AuthUser = { id: 2, username: 'asha', role: 'user' };
        await assert.rejects(activityService.bulkRemove(['a1', 'a2'], asha), rejectsWith(403));
        await assert.rejects(activityService.remove('a1', asha), rejectsWith(403));
        assert.equal(state.activities.some((a) => a.isDeleted), false);
    });
});

describe('runActivityPostCommit', () => {
    it('notifies a new owner unless notify is false (per row or for the call), and accepts a bare username', async () => {
        const state = installActivityDouble({ users: USERS });
        const sent: string[] = [];
        // notify() writes through the shared client: capture the rows it would insert.
        const { prisma } = await import('../../config/prisma.js');
        const client = prisma as unknown as Record<string, unknown>;
        const real = client.notification;
        Object.defineProperty(client, 'notification', {
            configurable: true,
            writable: true,
            value: {
                findMany: async () => [],
                createMany: async ({ data }: { data: { username: string; kind: string }[] }) => {
                    sent.push(...data.map((d) => `${d.kind}:${d.username}`));
                    return { count: data.length };
                },
            },
        });
        try {
            const after = { ...blankActivity({ id: 'a9', subject: 'Visit', assignedTo: 'asha', createdBy: 'palak', startAt: inDays(1) }), attendees: [] };
            await runActivityPostCommit([{ before: null, after, notify: false }], 'palak');
            await runActivityPostCommit([{ before: null, after }], 'palak', { notify: false });
            assert.deepEqual(sent, []);
            await runActivityPostCommit([{ before: null, after }], 'palak');
            assert.deepEqual(sent, ['activity_assigned:asha']);
            assert.ok(state.calls.includes('user.findMany'));
        } finally {
            Object.defineProperty(client, 'notification', { configurable: true, writable: true, value: real });
        }
    });
});
