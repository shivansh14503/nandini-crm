import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { Activity } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { addDays, instantToZonedWallClock, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { isCreateEligible } from '../calendar-sync/sync.outbox.js';
import { isoWeekday } from './activity.recurrence.js';
import { SERIES_HORIZON_DAYS, SERIES_SYNC_WINDOW_DAYS } from './activity.series.constants.js';
import { activitySeriesService, extendSeriesHorizons, SERIES_SCOPE_REQUIRED } from './activity.series.js';
import type { ActivityRow } from './activity.mapper.js';
import { blankActivity, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from './testing/activityDouble.js';

const TZ = 'Asia/Kolkata';
const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true },
    { username: 'asha', fullName: 'Asha Rao', isActive: true },
];

const today = () => zonedDayOf(new Date(), TZ);
/** The Monday at least 7 days from today (business time zone). */
function nextMonday(): string {
    let day = addDays(today(), 7);
    while (isoWeekday(day) !== 1) day = addDays(day, 1);
    return day;
}
const at = (day: string, time: string) => zonedWallClockToInstant(`${day}T${time}`, TZ);

const rejectsWith = (status: number, code?: string) => (err: unknown) => {
    assert.ok(err instanceof HttpError, String(err));
    assert.equal(err.statusCode, status, err.message);
    if (code) assert.equal(err.code, code);
    return true;
};

const live = (state: ActivityDoubleState, seriesId?: string) =>
    state.activities.filter((a) => !a.isDeleted && (seriesId ? a.seriesId === seriesId : a.seriesId)).sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
const dayOf = (a: Activity) => zonedDayOf(a.startAt as Date, TZ);

/** A weekly Mon / Wed meeting series from next Monday, 10:00–10:45. */
async function createWeekly(state: ActivityDoubleState, extra: Record<string, unknown> = {}) {
    const monday = nextMonday();
    const view = await activitySeriesService.create(
        {
            followupType: 'Meeting',
            subject: 'Weekly review',
            assignedTo: 'palak',
            startAt: at(monday, '10:00').toISOString(),
            endAt: at(monday, '10:45').toISOString(),
            location: 'Room 1',
            repeat: { frequency: 'weekly', weekdays: [1, 3] },
            ...extra,
        },
        PALAK,
    );
    return { view, monday, seriesId: view.seriesId };
}

afterEach(() => restoreActivityDouble());

describe('activitySeriesService.create', () => {
    it('creates the series and one row per occurrence through the horizon, numbered, with small audit entries', async () => {
        const state = installActivityDouble({ users: USERS });
        const { view, monday, seriesId } = await createWeekly(state);
        assert.ok(seriesId);
        assert.equal(state.series.length, 1);
        assert.equal(state.series[0].weekdays, '1,3');
        assert.equal(state.series[0].startTime, '10:00');
        assert.equal(state.series[0].durationMinutes, 45);
        assert.equal(view.series?.summary, 'Every week on Mon, Wed');
        assert.equal(view.series?.index, 1);

        const rows = live(state, seriesId);
        const horizon = addDays(today(), SERIES_HORIZON_DAYS);
        assert.ok(rows.every((r) => dayOf(r) <= horizon));
        assert.ok(rows.length >= 20 && rows.length <= 27, String(rows.length));
        assert.deepEqual(
            rows.slice(0, 3).map((r) => [dayOf(r), instantToZonedWallClock(r.startAt as Date, TZ).slice(11), r.seriesIndex]),
            [
                [monday, '10:00', 1],
                [addDays(monday, 2), '10:00', 2],
                [addDays(monday, 7), '10:00', 3],
            ],
        );
        assert.ok(rows.every((r) => r.originalStartAt?.getTime() === r.startAt?.getTime() && r.location === 'Room 1' && r.endAt!.getTime() - r.startAt!.getTime() === 45 * 60_000));
        assert.equal(state.series[0].materializedThrough, horizon);

        const creates = state.audits.filter((a) => a.entityType === 'Activity' && a.action === 'CREATE');
        assert.equal(creates.length, rows.length);
        // The first is the full snapshot (a user's create); the others carry only subject, series and slot.
        assert.ok('remarks' in (creates[0].changes as object));
        assert.deepEqual(Object.keys(creates[1].changes as object).sort(), ['originalStartAt', 'seriesId', 'subject']);
        const seriesAudit = state.audits.find((a) => a.entityType === 'ActivitySeries');
        assert.equal(seriesAudit?.action, 'CREATE');
        assert.equal((seriesAudit?.changes as { repeat: string }).repeat, 'Every week on Mon, Wed');
    });

    it('a counted series creates exactly that many occurrences and is complete', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { repeat: { frequency: 'daily', ends: 'after', count: 4 } });
        assert.equal(live(state, seriesId).length, 4);
        assert.ok(state.series[0].endedAt, 'nothing left to create');
        assert.equal((await extendSeriesHorizons()).created, 0);
    });

    it('refuses notes and bad rules; a plain create without repeat is an ordinary activity', async () => {
        const state = installActivityDouble({ users: USERS });
        await assert.rejects(
            activitySeriesService.create({ followupType: 'Note', subject: 'n', assignedTo: 'palak', remarks: 'Pricing discussed', repeat: { frequency: 'daily' } }, PALAK),
            rejectsWith(400),
        );
        await assert.rejects(createWeekly(state, { repeat: { frequency: 'daily', ends: 'on', untilDay: '2020-01-01' } }), rejectsWith(400));
        const plain = await activitySeriesService.create({ followupType: 'Call', subject: 'c', assignedTo: 'palak', startAt: at(nextMonday(), '09:00').toISOString(), repeat: null }, PALAK);
        assert.equal(plain.seriesId, '');
        assert.equal(plain.series, null);
        assert.equal(state.series.length, 0);
    });
});

describe('activitySeriesService.update', () => {
    it('this event: an ordinary update that makes the occurrence an exception; a rule change needs another scope', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const second = live(state, seriesId)[1];
        const saved = await activitySeriesService.update(second.id, { subject: 'Review with Asha' }, PALAK, { scope: 'this' });
        assert.equal(saved.subject, 'Review with Asha');
        assert.equal(saved.series?.exception, true);
        assert.equal(live(state, seriesId)[2].subject, 'Weekly review');
        // Status alone doesn't make an exception.
        const third = live(state, seriesId)[2];
        await activitySeriesService.update(third.id, { status: 'Cancelled' }, PALAK);
        assert.equal(state.activities.find((a) => a.id === third.id)?.seriesException, false);
        await assert.rejects(activitySeriesService.update(second.id, { repeat: { frequency: 'daily' } }, PALAK, { scope: 'this' }), rejectsWith(400, SERIES_SCOPE_REQUIRED));
        // Sending the same rule back with "this" is fine.
        await activitySeriesService.update(second.id, { repeat: { frequency: 'weekly', weekdays: [1, 3] }, location: 'Room 2' }, PALAK, { scope: 'this' });
    });

    it('all events: rewrites future planned non-exception occurrences, never exceptions or completed ones', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        await activitySeriesService.update(rows[1].id, { subject: 'Changed alone' }, PALAK);
        const completed = state.activities.find((a) => a.id === rows[2].id) as Activity;
        completed.status = 'Completed';
        const auditsBefore = state.audits.length;

        await activitySeriesService.update(
            rows[0].id,
            { subject: 'Weekly review (new room)', location: 'Room 9', startAt: at(dayOf(rows[0]), '11:00').toISOString(), endAt: at(dayOf(rows[0]), '12:00').toISOString() },
            PALAK,
            { scope: 'all' },
        );
        const after = live(state, seriesId);
        assert.equal(after.find((a) => a.id === rows[1].id)?.subject, 'Changed alone');
        assert.equal(after.find((a) => a.id === rows[2].id)?.subject, 'Weekly review');
        const rewritten = after.filter((a) => a.id !== rows[1].id && a.id !== rows[2].id);
        assert.ok(rewritten.length > 5);
        assert.ok(rewritten.every((a) => a.subject === 'Weekly review (new room)' && a.location === 'Room 9'));
        assert.ok(rewritten.every((a) => instantToZonedWallClock(a.startAt as Date, TZ).endsWith('T11:00') && a.originalStartAt?.getTime() === a.startAt?.getTime()));
        assert.equal(state.series[0].startTime, '11:00');
        assert.equal(state.series[0].durationMinutes, 60);
        const entry = state.audits.slice(auditsBefore).find((a) => a.entityType === 'ActivitySeries');
        assert.equal(entry?.action, 'UPDATE');
        assert.equal((entry?.changes as { scope: string }).scope, 'all');
        assert.deepEqual((entry?.changes as { startTime: unknown }).startTime, { from: '10:00', to: '11:00' });
    });

    it('all events: a new rule pairs rows by day, deletes those off the rule and creates the new days', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const first = live(state, seriesId)[0];
        await activitySeriesService.update(first.id, { repeat: { frequency: 'weekly', weekdays: [1, 4] } }, PALAK, { scope: 'all' });
        const days = live(state, seriesId).map(dayOf);
        assert.ok(days.includes(addDays(monday, 3)), 'Thursday created');
        assert.ok(!days.includes(addDays(monday, 2)), 'Wednesday deleted');
        assert.ok(days.includes(addDays(monday, 7)), 'Mondays kept');
        assert.equal(state.series[0].weekdays, '1,4');
        // A deleted Wednesday row is still there (soft) and keeps its slot.
        assert.ok(state.activities.some((a) => a.isDeleted && a.seriesId === seriesId && dayOf(a) === addDays(monday, 2)));
    });

    it('all events: moving the day is refused', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const first = live(state, seriesId)[0];
        await assert.rejects(
            activitySeriesService.update(first.id, { startAt: at(addDays(monday, 1), '10:00').toISOString(), endAt: at(addDays(monday, 1), '10:45').toISOString() }, PALAK, { scope: 'all' }),
            rejectsWith(400),
        );
    });

    it('this and following: splits the series at the occurrence', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const rows = live(state, seriesId);
        const pivot = rows[4]; // Monday of week 3
        const pivotDay = dayOf(pivot);
        const saved = await activitySeriesService.update(pivot.id, { subject: 'New format' }, PALAK, { scope: 'following' });
        const old = state.series.find((s) => s.id === seriesId)!;
        assert.equal(old.untilDay, addDays(pivotDay, -1));
        assert.ok(old.endedAt);
        assert.ok(saved.seriesId && saved.seriesId !== seriesId);
        assert.equal(saved.series?.index, 1);
        const fresh = state.series.find((s) => s.id === saved.seriesId)!;
        assert.equal(fresh.splitFromId, seriesId);
        assert.equal(fresh.startDay, pivotDay);
        assert.deepEqual(live(state, seriesId).map(dayOf), [monday, addDays(monday, 2), addDays(monday, 7), addDays(monday, 9)]);
        const moved = live(state, fresh.id);
        assert.ok(moved.length > 5 && moved.every((a) => a.subject === 'New format' && dayOf(a) >= pivotDay));
        assert.deepEqual(
            moved.slice(0, 2).map((a) => a.seriesIndex),
            [1, 2],
        );
    });

    it('cancel from here (all): future planned occurrences are cancelled and the series ends', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        await activitySeriesService.update(rows[0].id, { status: 'Cancelled' }, PALAK, { scope: 'all' });
        assert.ok(live(state, seriesId).every((a) => a.status === 'Cancelled'));
        assert.ok(state.series[0].endedAt);
    });

    it('repeat on a single activity makes it occurrence 1 of a new series; follow-up activities cannot repeat', async () => {
        const monday = nextMonday();
        const single = blankActivity({ id: 'a1', subject: 'Demo', assignedTo: 'palak', createdBy: 'palak', startAt: at(monday, '15:00'), endAt: at(monday, '16:00') });
        const followUp = blankActivity({ id: 'f1', subject: 'Call', assignedTo: 'palak', createdBy: 'palak', origin: 'followup', relatedModule: 'leads', startAt: at(monday, '15:00'), endAt: at(monday, '15:30') });
        const state = installActivityDouble({ users: USERS, activities: [single, followUp] });
        const view = await activitySeriesService.update('a1', { repeat: { frequency: 'weekly', ends: 'after', count: 3 } }, PALAK);
        assert.equal(view.series?.summary, 'Every week on Mon, 3 times');
        assert.deepEqual(live(state, view.seriesId).map(dayOf), [monday, addDays(monday, 7), addDays(monday, 14)]);
        await assert.rejects(activitySeriesService.update('f1', { repeat: { frequency: 'daily' } }, PALAK), rejectsWith(409, 'FOLLOW_UP_ACTIVITY_LOCKED'));
    });
});

describe('activitySeriesService.remove', () => {
    it('this: one occurrence; the nightly never creates it again', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const victim = live(state, seriesId)[3];
        await activitySeriesService.remove(victim.id, PALAK, { scope: 'this' });
        assert.ok(state.activities.find((a) => a.id === victim.id)?.isDeleted);
        state.series[0].materializedThrough = today(); // as if the horizon were behind
        const count = state.activities.length;
        await extendSeriesHorizons();
        assert.equal(state.activities.length, count, 'every day already holds a row');
        assert.equal(state.activities.filter((a) => a.seriesId === seriesId && dayOf(a) === dayOf(victim)).length, 1);
    });

    it('following: the series ends the day before and later non-completed occurrences go', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        (state.activities.find((a) => a.id === rows[6].id) as Activity).status = 'Completed';
        await activitySeriesService.remove(rows[3].id, PALAK, { scope: 'following' });
        const left = live(state, seriesId);
        assert.deepEqual(
            left.map((a) => a.id),
            [rows[0].id, rows[1].id, rows[2].id, rows[6].id],
        );
        assert.equal(state.series[0].untilDay, addDays(dayOf(rows[3]), -1));
        assert.equal(state.audits.filter((a) => a.entityType === 'ActivitySeries').at(-1)?.action, 'UPDATE');
    });

    it('all: the series is deleted with its future occurrences', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        await activitySeriesService.remove(live(state, seriesId)[2].id, PALAK, { scope: 'all' });
        assert.equal(live(state, seriesId).length, 0);
        assert.ok(state.series[0].isDeleted);
        assert.equal(state.audits.filter((a) => a.entityType === 'ActivitySeries').at(-1)?.action, 'DELETE');
        assert.equal((await extendSeriesHorizons()).series, 0);
    });
});

describe('extendSeriesHorizons', () => {
    it('creates the missing occurrences up to the horizon once (a second run creates nothing)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { repeat: { frequency: 'daily' } });
        // Pretend the series was made 30 days of horizon ago: drop the last 30 days of rows.
        const cut = addDays(today(), SERIES_HORIZON_DAYS - 30);
        state.activities = state.activities.filter((a) => !(a.seriesId === seriesId && dayOf(a) > cut));
        state.series[0].materializedThrough = cut;
        const before = live(state, seriesId).length;
        const first = await extendSeriesHorizons();
        assert.equal(first.created, 30);
        assert.equal(live(state, seriesId).length, before + 30);
        assert.equal(state.series[0].materializedThrough, addDays(today(), SERIES_HORIZON_DAYS));
        const second = await extendSeriesHorizons();
        assert.equal(second.series, 0);
        assert.equal(second.created, 0);
    });
});

describe('calendar sync window (invitation flood control)', () => {
    it('an occurrence more than the window ahead is not create-eligible yet; a single activity is', () => {
        const now = new Date();
        const far = new Date(now.getTime() + (SERIES_SYNC_WINDOW_DAYS + 1) * 24 * 3_600_000);
        const near = new Date(now.getTime() + (SERIES_SYNC_WINDOW_DAYS - 1) * 24 * 3_600_000);
        const row = (start: Date, seriesId: string | null): ActivityRow => ({
            ...blankActivity({ id: 'x', subject: 's', assignedTo: 'palak', createdBy: 'palak', startAt: start, endAt: new Date(start.getTime() + 3_600_000), seriesId }),
            attendees: [],
        });
        assert.equal(isCreateEligible(row(far, 's1'), null, now), false);
        assert.equal(isCreateEligible(row(near, 's1'), null, now), true);
        assert.equal(isCreateEligible(row(far, null), null, now), true);
    });
});
