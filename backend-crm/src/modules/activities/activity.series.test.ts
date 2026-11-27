import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Activity } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { addDays, instantToZonedWallClock, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { setFakeProviderEnabledForTests } from '../calendar-sync/providers/fakeSwitch.js';
import { isCreateEligible } from '../calendar-sync/sync.outbox.js';
import { setInlinePushForTests } from '../calendar-sync/sync.wake.js';
import { blankConnection, type ConnectionRowState } from '../calendar-sync/testing/connectionDouble.js';
import { prisma } from '../../config/prisma.js';
import { runInTransaction } from '../shared/transactions.js';
import { applySystemPatch } from './activity.system.js';
import { isoWeekday } from './activity.recurrence.js';
import { SERIES_HORIZON_DAYS, SERIES_SYNC_WINDOW_DAYS } from './activity.series.constants.js';
import { activitySeriesService, extendSeriesHorizons, isRewritable, markSeriesSyncWindow, SERIES_SCOPE_REQUIRED } from './activity.series.js';
import type { ActivityRow } from './activity.mapper.js';
import { blankActivity, blankLink, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from './testing/activityDouble.js';

const TZ = 'Asia/Kolkata';
const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const ASHA: AuthUser = { id: 2, username: 'asha', role: 'user' };
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
        // The Wednesday row the rule dropped is soft-deleted and detached: its slot can come back.
        const dropped = state.activities.find((a) => a.isDeleted && dayOf(a) === addDays(monday, 2));
        assert.ok(dropped && dropped.seriesId === null && dropped.originalStartAt === null);
    });

    it('all events: a rule changed and changed back brings the dropped days back (fortnightly and back too)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const total = live(state, seriesId).length;
        const first = () => live(state, seriesId)[0];
        await activitySeriesService.update(first().id, { repeat: { frequency: 'weekly', weekdays: [1] } }, PALAK, { scope: 'all' });
        assert.ok(live(state, seriesId).every((a) => isoWeekday(dayOf(a)) === 1));
        await activitySeriesService.update(first().id, { repeat: { frequency: 'weekly', weekdays: [1, 3] } }, PALAK, { scope: 'all' });
        assert.equal(live(state, seriesId).length, total);
        assert.ok(live(state, seriesId).some((a) => dayOf(a) === addDays(monday, 9)), 'Wednesdays are back');
        await activitySeriesService.update(first().id, { repeat: { frequency: 'weekly', interval: 2, weekdays: [1, 3] } }, PALAK, { scope: 'all' });
        await activitySeriesService.update(first().id, { repeat: { frequency: 'weekly', interval: 1, weekdays: [1, 3] } }, PALAK, { scope: 'all' });
        assert.equal(live(state, seriesId).length, total);
    });

    it('all events: an occurrence whose new time has already passed today is left as it is', async (t) => {
        const hour = Number(instantToZonedWallClock(new Date(), TZ).slice(11, 13));
        if (hour < 2 || hour >= 21) return t.skip('needs two hours of room on both sides of now (business time zone)');
        const state = installActivityDouble({ users: USERS });
        const wall = (offsetMinutes: number) => instantToZonedWallClock(new Date(Date.now() + offsetMinutes * 60_000), TZ).slice(11, 16);
        const day = today();
        const later = wall(90);
        const view = await activitySeriesService.create(
            { followupType: 'Meeting', subject: 'Stand-up', assignedTo: 'palak', startAt: at(day, later).toISOString(), endAt: at(day, wall(105)).toISOString(), repeat: { frequency: 'daily' } },
            PALAK,
        );
        const todays = live(state, view.seriesId)[0];
        const tomorrow = live(state, view.seriesId)[1];
        const earlier = wall(-60);
        await activitySeriesService.update(tomorrow.id, { startAt: at(dayOf(tomorrow), earlier).toISOString(), endAt: at(dayOf(tomorrow), wall(-45)).toISOString() }, PALAK, { scope: 'all' });
        const kept = state.activities.find((a) => a.id === todays.id) as Activity;
        assert.equal(kept.isDeleted, false, "today's occurrence that hasn't started stays");
        assert.equal(instantToZonedWallClock(kept.startAt as Date, TZ).slice(11, 16), later);
        assert.equal(live(state, view.seriesId).filter((a) => dayOf(a) === day).length, 1);
    });

    it('all events on an occurrence moved alone keeps its own slot (no duplicate, the target day keeps its event)', async () => {
        const state = installActivityDouble({ users: USERS, series: [] });
        const { seriesId, monday } = await createWeekly(state, { repeat: { frequency: 'daily' } });
        const wed = live(state, seriesId).find((a) => dayOf(a) === addDays(monday, 2)) as Activity;
        const thu = live(state, seriesId).find((a) => dayOf(a) === addDays(monday, 3)) as Activity;
        const thursday = addDays(monday, 3);
        await activitySeriesService.update(wed.id, { startAt: at(thursday, '10:00').toISOString(), endAt: at(thursday, '10:45').toISOString() }, PALAK, { scope: 'this' });
        await activitySeriesService.update(wed.id, { subject: 'Renamed' }, PALAK, { scope: 'all' });
        const moved = state.activities.find((a) => a.id === wed.id) as Activity;
        assert.equal(moved.seriesException, true);
        assert.equal(dayOf({ startAt: moved.originalStartAt } as Activity), addDays(monday, 2), 'keeps its Wednesday slot');
        const thuNow = state.activities.find((a) => a.id === thu.id) as Activity;
        assert.equal(thuNow.isDeleted, false);
        assert.equal(thuNow.subject, 'Renamed');
        assert.equal(live(state, seriesId).filter((a) => dayOf(a) === addDays(monday, 2)).length, 0, 'no new Wednesday');
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

    it('cancel from here (all): future planned occurrences, exceptions too, are cancelled and the series stays ended', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const rows = live(state, seriesId);
        const tuesday = addDays(monday, 8);
        await activitySeriesService.update(rows[3].id, { startAt: at(tuesday, '10:00').toISOString(), endAt: at(tuesday, '10:45').toISOString() }, PALAK, { scope: 'this' });
        await activitySeriesService.update(rows[0].id, { status: 'Cancelled' }, PALAK, { scope: 'all' });
        assert.ok(live(state, seriesId).every((a) => a.status === 'Cancelled'));
        assert.ok(state.series[0].endedAt);
        assert.ok(state.series[0].untilDay, 'the rule ends too');
        // A later "All events" edit of a cancelled occurrence doesn't bring the series back.
        await activitySeriesService.update(rows[2].id, { subject: 'Typo fixed' }, PALAK, { scope: 'all' });
        assert.ok(state.series[0].endedAt);
        state.series[0].materializedThrough = today();
        assert.equal((await extendSeriesHorizons()).created, 0);
        assert.ok(live(state, seriesId).every((a) => a.status === 'Cancelled'));
    });

    it('this and following moving the occurrence onto another slot day: no duplicate slot, one event a day', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const rows = live(state, seriesId);
        const mon = rows[2]; // Monday of week 2
        const wed = addDays(dayOf(mon), 2);
        const saved = await activitySeriesService.update(mon.id, { startAt: at(wed, '10:00').toISOString(), endAt: at(wed, '10:45').toISOString() }, PALAK, { scope: 'following' });
        const fresh = saved.seriesId;
        assert.equal(live(state, fresh).filter((a) => dayOf(a) === wed).length, 1);
        assert.deepEqual(live(state, seriesId).map(dayOf), [monday, addDays(monday, 2)]);
        // Weekly on Mon, Wed and moved Mon → Wed: the rule has two days, so it stays as it is.
        assert.equal(state.series.find((s) => s.id === fresh)?.weekdays, '1,3');

        // Daily series, Thursday moved to the Wednesday before ("following"): Wednesday has one event.
        const daily = installActivityDouble({ users: USERS });
        const created = await createWeekly(daily, { repeat: { frequency: 'daily' } });
        const thu = live(daily, created.seriesId).find((a) => dayOf(a) === addDays(created.monday, 3)) as Activity;
        const wednesday = addDays(created.monday, 2);
        const split = await activitySeriesService.update(thu.id, { startAt: at(wednesday, '11:00').toISOString(), endAt: at(wednesday, '11:45').toISOString() }, PALAK, { scope: 'following' });
        const all = daily.activities.filter((a) => !a.isDeleted && a.seriesId && dayOf(a) === wednesday);
        assert.equal(all.length, 1);
        assert.equal(all[0].id, thu.id);
        assert.equal(daily.series.find((s) => s.id === created.seriesId)?.untilDay, addDays(wednesday, -1));
        assert.ok(live(daily, split.seriesId).some((a) => dayOf(a) === addDays(created.monday, 3)), 'Thursday comes back in the new series');
    });

    it('this and following moving a weekly one-day series to another weekday moves the rule too', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state, { repeat: { frequency: 'weekly', weekdays: [1] } });
        const second = live(state, seriesId)[1];
        const tuesday = addDays(dayOf(second), 1);
        const saved = await activitySeriesService.update(second.id, { startAt: at(tuesday, '10:00').toISOString(), endAt: at(tuesday, '10:45').toISOString() }, PALAK, { scope: 'following' });
        assert.equal(saved.series?.summary, 'Every week on Tue');
        assert.ok(live(state, saved.seriesId).every((a) => isoWeekday(dayOf(a)) === 2));
        assert.deepEqual(live(state, seriesId).map(dayOf), [monday]);
    });

    it('this and following keeps the count left when the days change and the total is sent back', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { repeat: { frequency: 'weekly', weekdays: [1], ends: 'after', count: 10 } });
        const sixth = live(state, seriesId)[5];
        const saved = await activitySeriesService.update(sixth.id, { repeat: { frequency: 'weekly', weekdays: [1, 2], ends: 'after', count: 10 } }, PALAK, { scope: 'following' });
        assert.equal(state.series.find((s) => s.id === saved.seriesId)?.count, 5);
        assert.equal(live(state, seriesId).length + live(state, saved.seriesId).length, 10);
    });

    it('this and following moving earlier onto a day the rule lacks: the old day does not come back as an extra event', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state);
        const wed = live(state, seriesId).find((a) => dayOf(a) === addDays(monday, 9)) as Activity; // Wednesday of week 2
        const tuesday = addDays(monday, 8);
        const saved = await activitySeriesService.update(wed.id, { startAt: at(tuesday, '10:00').toISOString(), endAt: at(tuesday, '10:45').toISOString() }, PALAK, { scope: 'following' });
        const days = state.activities.filter((a) => !a.isDeleted && a.seriesId).map(dayOf);
        assert.ok(!days.includes(addDays(monday, 9)), 'no new Wednesday in week 2');
        assert.deepEqual(days.filter((d) => d >= addDays(monday, 7) && d <= addDays(monday, 13)).sort(), [addDays(monday, 7), tuesday]);
        assert.ok(days.includes(addDays(monday, 14)) && days.includes(addDays(monday, 16)), 'Mondays and Wednesdays go on');
        assert.ok(!days.includes(addDays(monday, 15)), 'no Tuesday in week 3: the rule kept its days');
        assert.equal(saved.series?.exception, true);
        assert.equal(state.series.find((s) => s.id === saved.seriesId)?.weekdays, '1,3');

        // Weekly on Wed, moved alone to the Monday before, then renamed "This and following": its Wednesday stays empty.
        const weekly = installActivityDouble({ users: USERS });
        const made = await createWeekly(weekly, { repeat: { frequency: 'weekly', weekdays: [3] } });
        // (The series starts on a Monday, so its first event is that Monday; take the second Wednesday.)
        const target = live(weekly, made.seriesId)[2];
        const wednesday = dayOf(target);
        const mon = addDays(wednesday, -2);
        await activitySeriesService.update(target.id, { startAt: at(mon, '10:00').toISOString(), endAt: at(mon, '10:45').toISOString() }, PALAK, { scope: 'this' });
        const renamed = await activitySeriesService.update(target.id, { subject: 'Renamed' }, PALAK, { scope: 'following' });
        const after = weekly.activities.filter((a) => !a.isDeleted && a.seriesId);
        assert.equal(after.filter((a) => dayOf(a) === wednesday).length, 0, 'no new Wednesday');
        assert.equal(after.filter((a) => dayOf(a) === mon).length, 1);
        const fresh = live(weekly, renamed.seriesId);
        assert.ok(fresh.every((a) => a.subject === 'Renamed'));
        assert.ok(fresh.filter((a) => a.id !== target.id).every((a) => isoWeekday(dayOf(a)) === 3), 'later events stay on Wednesdays');
    });

    it('this and following moving a counted series earlier keeps every occurrence left', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId, monday } = await createWeekly(state, { repeat: { frequency: 'daily', ends: 'after', count: 20 } });
        const ninth = live(state, seriesId)[8];
        const target = addDays(dayOf(ninth), -2);
        const saved = await activitySeriesService.update(ninth.id, { startAt: at(target, '10:00').toISOString(), endAt: at(target, '10:45').toISOString() }, PALAK, { scope: 'following' });
        const all = [...live(state, seriesId), ...live(state, saved.seriesId)];
        assert.equal(all.length, 20);
        assert.equal(all.map(dayOf).sort().at(-1), addDays(monday, 19));
    });

    it('this and following renumbers the moved events it leaves alone (no "7th of 6")', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { repeat: { frequency: 'daily', ends: 'after', count: 10 } });
        const rows = live(state, seriesId);
        await activitySeriesService.update(rows[6].id, { subject: 'On its own' }, PALAK, { scope: 'this' });
        const saved = await activitySeriesService.update(rows[4].id, { subject: 'New format' }, PALAK, { scope: 'following' });
        const exception = await activitySeriesService.update(rows[6].id, {}, PALAK, { scope: 'this' });
        assert.equal(saved.series?.total, 6);
        assert.equal(exception.series?.index, 3);
        assert.equal(exception.series?.exception, true);
        assert.deepEqual(
            live(state, saved.seriesId).map((a) => a.seriesIndex),
            [1, 2, 3, 4, 5, 6],
        );
    });

    it('all events from an occurrence changed on its own spreads only what this save changed', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        const day = dayOf(rows[1]);
        await activitySeriesService.update(rows[1].id, { startAt: at(day, '16:00').toISOString(), endAt: at(day, '17:30').toISOString(), location: 'Client office' }, PALAK, { scope: 'this' });
        await activitySeriesService.update(rows[1].id, { subject: 'Weekly review (typo fixed)' }, PALAK, { scope: 'all' });
        assert.equal(state.series[0].startTime, '10:00');
        assert.equal(state.series[0].durationMinutes, 45);
        const others = live(state, seriesId).filter((a) => a.id !== rows[1].id);
        assert.ok(others.every((a) => a.subject === 'Weekly review (typo fixed)' && a.location === 'Room 1'));
        assert.ok(others.every((a) => instantToZonedWallClock(a.startAt as Date, TZ).endsWith('T10:00')));
        const edited = state.activities.find((a) => a.id === rows[1].id) as Activity;
        assert.equal(instantToZonedWallClock(edited.startAt as Date, TZ).slice(11, 16), '16:00');
        assert.equal(edited.location, 'Client office');
        assert.equal(edited.seriesException, true, 'still changed on its own');
        assert.equal(JSON.parse(state.series[0].templateJson).location, 'Room 1');
    });

    it('does not repeat (all) keeps occurrences that are already over today', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        // As if the first occurrence had been this morning (still Planned, never marked done).
        const past = state.activities.find((a) => a.id === rows[0].id) as Activity;
        past.startAt = new Date(Date.now() - 3_600_000);
        await activitySeriesService.update(rows[4].id, { repeat: null }, PALAK, { scope: 'all' });
        assert.equal((state.activities.find((a) => a.id === rows[0].id) as Activity).isDeleted, false);
        assert.deepEqual(
            live(state, seriesId)
                .map((a) => a.id)
                .sort(),
            [rows[0].id, rows[4].id].sort(),
        );
    });

    it('following / all need the right to change the series, not only the clicked occurrence', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const target = live(state, seriesId)[2];
        await activitySeriesService.update(target.id, { assignedTo: 'asha' }, PALAK, { scope: 'this' });
        await assert.rejects(activitySeriesService.remove(target.id, ASHA, { scope: 'all' }), rejectsWith(403));
        await assert.rejects(activitySeriesService.update(target.id, { subject: 'Mine now' }, ASHA, { scope: 'all' }), rejectsWith(403));
        await activitySeriesService.remove(target.id, ASHA, { scope: 'this' });
        assert.ok(live(state, seriesId).length > 10);
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

describe('recurring series and imported meetings (P2-8 merge)', () => {
    it('an imported meeting (origin calendar, organized outside the CRM) never becomes a series, and stays unchanged', async () => {
        const monday = nextMonday();
        const imported = blankActivity({
            id: 'imp1',
            subject: 'Customer call',
            assignedTo: 'palak',
            createdBy: 'calendar-sync',
            origin: 'calendar',
            externalOrganizer: true,
            organizerEmail: 'buyer@customer.example',
            startAt: at(monday, '15:00'),
            endAt: at(monday, '16:00'),
        });
        const ownImport = blankActivity({ id: 'imp2', subject: 'My own customer call', assignedTo: 'palak', createdBy: 'calendar-sync', origin: 'calendar', startAt: at(monday, '17:00'), endAt: at(monday, '17:30') });
        const state = installActivityDouble({ users: USERS, activities: [imported, ownImport] });
        await assert.rejects(activitySeriesService.update('imp1', { repeat: { frequency: 'weekly' } }, PALAK), rejectsWith(400));
        await assert.rejects(activitySeriesService.update('imp2', { repeat: { frequency: 'weekly' } }, PALAK), rejectsWith(400));
        assert.equal(state.series.length, 0);
        assert.ok(state.activities.every((a) => !a.seriesId));
    });

    it('an "All events" edit never rewrites a row the calendar owns (externalOrganizer), even inside the series', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId);
        // Not a path the CRM takes (imports never join a series): the guard alone keeps the lock.
        const locked = state.activities.find((a) => a.id === rows[3].id) as Activity;
        locked.externalOrganizer = true;
        assert.equal(isRewritable(locked as ActivityRow, new Set(), new Date()), false);
        assert.equal(isRewritable(state.activities.find((a) => a.id === rows[4].id) as ActivityRow, new Set(), new Date()), true);

        await activitySeriesService.update(rows[0].id, { subject: 'Weekly review (renamed)' }, PALAK, { scope: 'all' });
        const after = state.activities.find((a) => a.id === rows[3].id) as Activity;
        assert.equal(after.subject, 'Weekly review');
        assert.equal(after.isDeleted, false);
        assert.equal(live(state, seriesId).find((a) => a.id === rows[4].id)?.subject, 'Weekly review (renamed)');
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

describe('extendSeriesHorizons: a series keeps going', () => {
    it('extends a series whose invited colleague was deactivated since (the template was checked when saved)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { repeat: { frequency: 'daily' }, attendees: [{ kind: 'user', username: 'asha' }] });
        (state.users.find((u) => u.username === 'asha') as { isActive: boolean }).isActive = false;
        const cut = addDays(today(), SERIES_HORIZON_DAYS - 5);
        state.activities = state.activities.filter((a) => !(a.seriesId === seriesId && dayOf(a) > cut));
        state.series[0].materializedThrough = cut;
        assert.equal((await extendSeriesHorizons()).created, 5);
    });
});

describe('markSeriesSyncWindow', () => {
    const DAY = 24 * 3_600_000;
    const ASHA_ADMIN: AuthUser = { id: 2, username: 'asha', role: 'Admin' };
    const connection = (over: Partial<ConnectionRowState> = {}) =>
        blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), backfillCount: 0, ...over });
    let woken: string[] = [];
    beforeEach(() => {
        setFakeProviderEnabledForTests(true);
        woken = [];
        setInlinePushForTests((ids) => woken.push(...ids));
    });
    afterEach(() => {
        setFakeProviderEnabledForTests(null);
        setInlinePushForTests(null);
    });
    const guest = { kind: 'email', email: 'customer@example.com' };
    /** Drops the series' rows after `days` from today and lets the nightly create them again. */
    async function regrow(state: ActivityDoubleState, seriesId: string, days: number) {
        const cut = addDays(today(), days);
        state.activities = state.activities.filter((a) => !(a.seriesId === seriesId && dayOf(a) > cut));
        state.series.find((x) => x.id === seriesId)!.materializedThrough = cut;
        await extendSeriesHorizons();
        return live(state, seriesId).filter((a) => dayOf(a) > cut);
    }

    it("marks nightly occurrences as the series' last writer (D41): the owner's takeover sends, one held notice per series", async () => {
        const state = installActivityDouble({ users: USERS, connections: [connection()] });
        // Asha (admin) sets up Palak's series with a customer: the in-window copies are private, one notice in all.
        const made = await activitySeriesService.create(
            { followupType: 'Meeting', subject: 'Client call', assignedTo: 'palak', startAt: at(nextMonday(), '15:00').toISOString(), endAt: at(nextMonday(), '15:30').toISOString(), attendees: [guest], repeat: { frequency: 'daily' } },
            ASHA_ADMIN,
        );
        const inWindow = state.links.filter((l) => live(state, made.seriesId).some((a) => a.id === l.activityId));
        assert.ok(inWindow.length >= 2 && inWindow.every((l) => l.invites === 'withhold'));
        assert.equal(state.notifications.filter((n) => n.kind === 'calendar_invites_held').length, 1);
        // Palak takes the series over ("All events"): the series' last writer is the owner now.
        await activitySeriesService.update(live(state, made.seriesId)[0].id, { location: 'Zoom' }, PALAK, { scope: 'all' });
        const grown = await regrow(state, made.seriesId, 40);
        assert.ok(grown.length > 0 && grown.every((a) => a.updatedBy === null && a.createdBy === 'asha'));
        const target = grown[0];
        const marked = await markSeriesSyncWindow(new Date((target.startAt as Date).getTime() - 13 * DAY));
        assert.ok(marked > 0);
        assert.equal(state.links.find((l) => l.activityId === target.id)?.invites, 'send');
    });

    it('a series set up by someone else stays private on the nightly mark, without a notice a night', async () => {
        const state = installActivityDouble({ users: USERS, connections: [connection()] });
        const made = await activitySeriesService.create(
            { followupType: 'Meeting', subject: 'Client call', assignedTo: 'palak', startAt: at(nextMonday(), '15:00').toISOString(), endAt: at(nextMonday(), '15:30').toISOString(), attendees: [guest], repeat: { frequency: 'daily' } },
            ASHA_ADMIN,
        );
        const notices = () => state.notifications.filter((n) => n.kind === 'calendar_invites_held').length;
        const before = notices();
        const later = live(state, made.seriesId).find((a) => !state.links.some((l) => l.activityId === a.id)) as Activity;
        await markSeriesSyncWindow(new Date((later.startAt as Date).getTime() - 13 * DAY));
        assert.equal(state.links.find((l) => l.activityId === later.id)?.invites, 'withhold');
        assert.equal(notices(), before, 'the owner was told already: copies still wait');
    });

    it("a rename by someone else doesn't change who sends (D41); an occurrence the owner changed alone sends", async () => {
        const state = installActivityDouble({ users: USERS, connections: [connection()] });
        const made = await activitySeriesService.create(
            { followupType: 'Meeting', subject: 'Client call', assignedTo: 'palak', startAt: at(nextMonday(), '15:00').toISOString(), endAt: at(nextMonday(), '15:30').toISOString(), attendees: [guest], repeat: { frequency: 'daily' } },
            PALAK,
        );
        const unlinked = () => live(state, made.seriesId).filter((a) => !state.links.some((l) => l.activityId === a.id));
        // Asha corrects the organization's name: shared/nameSync.ts stamps updatedBy on every live row, with no audit entry.
        for (const a of state.activities) if (a.seriesId === made.seriesId) a.updatedBy = 'asha';
        const first = unlinked()[0];
        await markSeriesSyncWindow(new Date((first.startAt as Date).getTime() - 13 * DAY));
        assert.equal(state.links.find((l) => l.activityId === first.id)?.invites, 'send');
        assert.equal(state.notifications.filter((n) => n.kind === 'calendar_invites_held').length, 0);

        // The reverse: Asha (admin) set the series up, so it stays private; Palak renaming the customer doesn't send.
        const other = installActivityDouble({ users: USERS, connections: [connection()] });
        const setUp = await activitySeriesService.create(
            { followupType: 'Meeting', subject: 'Client call', assignedTo: 'palak', startAt: at(nextMonday(), '15:00').toISOString(), endAt: at(nextMonday(), '15:30').toISOString(), attendees: [guest], repeat: { frequency: 'daily' } },
            ASHA_ADMIN,
        );
        for (const a of other.activities) if (a.seriesId === setUp.seriesId) a.updatedBy = 'palak';
        const rest = live(other, setUp.seriesId).filter((a) => !other.links.some((l) => l.activityId === a.id));
        await markSeriesSyncWindow(new Date((rest[0].startAt as Date).getTime() - 13 * DAY));
        assert.equal(other.links.find((l) => l.activityId === rest[0].id)?.invites, 'withhold');
        // Palak changes one later occurrence on her own: she sent that one.
        const mine = rest[3];
        await activitySeriesService.update(mine.id, { location: 'Zoom' }, PALAK, { scope: 'this' });
        await markSeriesSyncWindow(new Date((mine.startAt as Date).getTime() - 13 * DAY));
        assert.equal(other.links.find((l) => l.activityId === mine.id)?.invites, 'send');
    });

    it('an occurrence the owner changed after the first-sync backfill is not a backfilled copy (D23)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        // The calendar is connected and backfilled now (after every row and its audit entry so far).
        const [last] = await (prisma as unknown as { auditLog: { findMany: (args: unknown) => Promise<{ createdAt: Date }[]> } }).auditLog.findMany({ orderBy: [{ id: 'desc' }], take: 1, select: { createdAt: true } });
        state.connections.push(connection({ backfilledAt: last.createdAt }));
        // Palak adds a customer to every event afterwards.
        await activitySeriesService.update(live(state, seriesId)[0].id, { attendees: [guest] }, PALAK, { scope: 'all' });
        const far = live(state, seriesId).find((a) => (a.startAt as Date).getTime() > Date.now() + 30 * DAY) as Activity;
        assert.ok(far.createdAt.getTime() <= last.createdAt.getTime(), 'existed before the backfill');
        await markSeriesSyncWindow(new Date((far.startAt as Date).getTime() - 13 * DAY));
        const link = state.links.find((l) => l.activityId === far.id);
        assert.equal(link?.invites, 'send');
        assert.notEqual(link?.createdAt.getTime(), last.createdAt.getTime(), 'not stamped as a backfill copy');
    });

    it('marks every occurrence entering the window in one night, more than one batch', async () => {
        const state = installActivityDouble({ users: USERS });
        const tomorrow = addDays(today(), 1);
        for (let i = 0; i < 20; i++) {
            await activitySeriesService.create(
                { followupType: 'Meeting', subject: `Stand-up ${i}`, assignedTo: 'palak', startAt: at(tomorrow, '10:00').toISOString(), endAt: at(tomorrow, '10:15').toISOString(), repeat: { frequency: 'daily' } },
                PALAK,
            );
        }
        state.connections.push(connection());
        const now = new Date();
        const inWindow = state.activities.filter((a) => a.seriesId && !a.isDeleted && (a.startAt as Date).getTime() >= now.getTime() && (a.startAt as Date).getTime() < now.getTime() + SERIES_SYNC_WINDOW_DAYS * DAY);
        assert.ok(inWindow.length > 200, String(inWindow.length));
        const marked = await markSeriesSyncWindow(now);
        assert.equal(marked, inWindow.length);
        assert.ok(inWindow.every((a) => state.links.some((l) => l.activityId === a.id && l.role === 'organizer')));
    });

    it('skips types that never sync, so they never fill the batch', async () => {
        const state = installActivityDouble({ users: USERS, connections: [connection()] });
        await createWeekly(state, { followupType: 'Task', repeat: { frequency: 'daily' } });
        assert.equal(await markSeriesSyncWindow(new Date(Date.now() + 20 * DAY)), 0);
        assert.equal(state.links.length, 0);
    });

    it('an occurrence that existed before the first-sync backfill becomes a backfilled private copy (D23)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state, { attendees: [guest] });
        const stamp = new Date(Date.now() + 1000);
        state.connections.push(connection({ backfilledAt: stamp }));
        const far = live(state, seriesId).find((a) => (a.startAt as Date).getTime() > Date.now() + 30 * DAY) as Activity;
        await markSeriesSyncWindow(new Date((far.startAt as Date).getTime() - 13 * DAY));
        const link = state.links.find((l) => l.activityId === far.id);
        assert.equal(link?.invites, 'withhold');
        assert.equal(link?.createdAt.getTime(), stamp.getTime());
    });

    it('dirties a gone event again once its occurrence is back inside the window', async () => {
        const state = installActivityDouble({ users: USERS, connections: [connection()] });
        const { seriesId } = await createWeekly(state);
        const rows = live(state, seriesId).filter((a) => (a.startAt as Date).getTime() > Date.now() + 30 * DAY);
        const [stale, fresh] = rows;
        const now = new Date((stale.startAt as Date).getTime() - 13 * DAY);
        state.links.push(
            blankLink({ id: 'l-stale', activityId: stale.id, connectionId: 'c1', provider: 'fake', requestedId: 'r1', state: 'cancelled', dirtyAt: null, updatedAt: new Date(now.getTime() - 30 * DAY) }),
            blankLink({ id: 'l-fresh', activityId: fresh.id, connectionId: 'c1', provider: 'fake', requestedId: 'r2', state: 'cancelled', dirtyAt: null, updatedAt: new Date(now.getTime() - DAY) }),
        );
        await markSeriesSyncWindow(now);
        assert.ok(state.links.find((l) => l.id === 'l-stale')?.dirtyAt, 'settled while outside the window: dirtied');
        assert.ok(woken.includes('l-stale'));
        assert.equal(state.links.find((l) => l.id === 'l-fresh')?.dirtyAt, null, 'cancelled inside the window: left alone');
    });
});

describe('a calendar change to one occurrence', () => {
    it('makes it an exception (a later "All events" edit leaves it alone)', async () => {
        const state = installActivityDouble({ users: USERS });
        const { seriesId } = await createWeekly(state);
        const target = live(state, seriesId)[2];
        const moved = at(dayOf(target), '15:00');
        await runInTransaction((tx) =>
            applySystemPatch(tx, target.id, { startAt: moved.toISOString(), endAt: new Date(moved.getTime() + 45 * 60_000).toISOString() }, 'palak', new Date(), {
                activityConfig: { fields: { module: 'activities', fields: [], activeOptions: new Map() }, followupTypes: null },
                markSync: false,
            }),
        );
        assert.equal(state.activities.find((a) => a.id === target.id)?.seriesException, true);
        await activitySeriesService.update(live(state, seriesId)[0].id, { location: 'Room 7' }, PALAK, { scope: 'all' });
        const after = state.activities.find((a) => a.id === target.id) as Activity;
        assert.equal(after.startAt?.getTime(), moved.getTime());
        assert.equal(after.location, 'Room 1');
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
