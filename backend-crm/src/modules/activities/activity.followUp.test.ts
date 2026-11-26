import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { CALENDAR_SYNC_DEFAULTS } from '../integrations/calendarSyncSettings.js';
import { opportunityFollowUpOutcome } from '../opportunities/opportunity.service.js';
import { runInTransaction } from '../shared/transactions.js';
import { FOLLOW_UP_ACTIVITY_LOCKED, lockedFieldsFor } from './activity.access.js';
import {
    cancelRecordFollowUps,
    desiredFollowUp,
    followUpSubject,
    followUpTypeOf,
    formatTimeOfDay,
    leadFollowUpTarget,
    NO_OUTCOME,
    opportunityFollowUpTarget,
    planFollowUpChange,
    reconcileRecordFollowUp,
    renameOrganizationFollowUps,
    retryOnceOnUniqueViolation,
    slotFromCalendar,
    type FollowUpOutcome,
    type FollowUpTarget,
    type LeadFollowUpRow,
    type OpenFollowUp,
    type OpportunityFollowUpRow,
} from './activity.followUp.js';
import { needsReconcile } from './activity.followUpBackfill.js';
import { activityService, type ActivityConfig } from './activity.service.js';
import type { FollowUpContext } from './activity.system.js';
import { blankActivity, installActivityDouble, restoreActivityDouble } from './testing/activityDouble.js';
import { HttpError } from '../../utils/httpError.js';

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-11-26T06:30:00.000Z'); // 12:00 IST
const CONFIG: ActivityConfig = { fields: { module: 'activities', fields: [], activeOptions: new Map() }, followupTypes: null };
const context = (over: Partial<FollowUpContext['calendarSettings']> = {}): FollowUpContext => ({
    activityConfig: CONFIG,
    calendarSettings: { ...CALENDAR_SYNC_DEFAULTS, ...over },
});

const LEAD_ROW: LeadFollowUpRow = {
    id: 'l1',
    leadCode: 'LD-0012',
    name: 'Sunrise Hotels',
    organizationName: 'SUNRISE HOTELS',
    assignedTo: 'ravi',
    createdBy: 'asha',
    followupType: 'Call',
    status: 'Follow-up',
    nextFollowupDate: new Date('2026-12-03T00:00:00.000Z'),
    nextFollowupTime: '11:00 AM',
    isDeleted: false,
};
const CLOSING = new Set(['Converted', 'Dead']);
const lead = (over: Partial<LeadFollowUpRow> = {}, extra: Partial<FollowUpTarget> = {}): FollowUpTarget => ({
    ...leadFollowUpTarget({ ...LEAD_ROW, ...over }, CLOSING),
    ...extra,
});

const OPP_ROW: OpportunityFollowUpRow = {
    id: 'o1',
    opportunityCode: 'OPP-0007',
    opportunityName: null,
    organizationName: 'Sunrise Hotels',
    organizationId: 'org1',
    contact: 'Asha Rao',
    contactId: 'c1',
    assignedTo: null,
    createdBy: 'palak',
    followupType: 'Task',
    salesStage: 'Proposal',
    nextFollowupDate: new Date('2026-12-03T00:00:00.000Z'),
    nextFollowupTime: '',
    isDeleted: false,
};

/** 11:00 IST on 3 Dec 2026, lasting the default 30 minutes. */
const START = new Date('2026-12-03T05:30:00.000Z');
const END = new Date('2026-12-03T06:00:00.000Z');

const openFa = (over: Partial<OpenFollowUp> = {}): OpenFollowUp => ({
    id: 'fa1',
    followupType: 'Call',
    subject: 'Call follow-up: LD-0012 Sunrise Hotels',
    assignedTo: 'ravi',
    createdBy: 'asha',
    startAt: START,
    endAt: END,
    allDay: false,
    timeZone: IST,
    organizationId: null,
    organizationName: 'SUNRISE HOTELS',
    contactId: null,
    contact: null,
    ...over,
});

const recorded = (decision: 'keep' | 'new' | 'closed', remarks = 'Asked for a revised quote'): FollowUpOutcome => ({ kind: 'recorded', response: 'Interested', remarks, decision });

describe('follow-up targets', () => {
    it('falls back to Call for a blank, Task or Note type and derives the subject', () => {
        assert.equal(followUpTypeOf(''), 'Call');
        assert.equal(followUpTypeOf(null), 'Call');
        assert.equal(followUpTypeOf('Task'), 'Call');
        assert.equal(followUpTypeOf('Note'), 'Call');
        assert.equal(followUpTypeOf(' Meeting '), 'Meeting');
        assert.equal(followUpSubject({ followupType: 'Task', code: 'LD-0012', name: ' Sunrise ' }), 'Call follow-up: LD-0012 Sunrise');
        assert.equal(followUpSubject({ followupType: 'Visit', code: 'X', name: 'y'.repeat(400) }).length, 200);
    });

    it('closes a lead in a closing status or deleted; an unowned lead goes to its creator', () => {
        assert.equal(lead().open, true);
        assert.equal(lead({ status: 'Dead' }).open, false);
        assert.equal(lead({ isDeleted: true }).open, false);
        assert.equal(lead({ assignedTo: null }).assignedTo, 'asha');
        assert.deepEqual(lead().slot, { date: '2026-12-03', time: '11:00 AM' });
        assert.equal(lead({ nextFollowupDate: null }).slot, null);
    });

    it('closes an opportunity at Closed Won / Lost and names it by its organization when unnamed', () => {
        const target = opportunityFollowUpTarget(OPP_ROW);
        assert.equal(target.open, true);
        assert.equal(target.name, 'Sunrise Hotels');
        assert.equal(target.assignedTo, 'palak');
        assert.equal(opportunityFollowUpTarget({ ...OPP_ROW, salesStage: 'Closed Won' }).open, false);
        assert.equal(opportunityFollowUpTarget({ ...OPP_ROW, salesStage: 'Closed Lost' }).open, false);
    });

    it('puts the slot at its business-timezone time for the type duration, or all day without a time', () => {
        const timed = desiredFollowUp(lead(), context(), IST);
        assert.deepEqual(timed.when, { allDay: false, startAt: START, endAt: END });
        assert.equal(timed.reminder, '15 minutes before');
        assert.equal(timed.createdBy, 'asha');
        assert.equal(timed.assignedTo, 'ravi');
        const allDay = desiredFollowUp(opportunityFollowUpTarget(OPP_ROW), context({ followUpReminder: null }), IST);
        assert.deepEqual(allDay.when, { allDay: true, day: '2026-12-03' });
        assert.equal(allDay.followupType, 'Call');
        assert.equal(allDay.reminder, null);
        assert.equal(desiredFollowUp(lead({ status: 'Converted' }), context(), IST).when, null);
    });
});

describe('planFollowUpChange', () => {
    const desired = (target = lead()) => desiredFollowUp(target, context(), IST);

    it('inserts a Planned follow-up activity with the record creator as createdBy', () => {
        const change = planFollowUpChange(null, desired(lead({ followupType: 'Note' })), NO_OUTCOME, NOW);
        assert.ok(change.insert);
        assert.equal(change.insert.createdBy, 'asha');
        assert.equal(change.insert.fields.followupType, 'Call');
        assert.equal(change.insert.fields.status, 'Planned');
        assert.equal(change.insert.fields.assignedTo, 'ravi');
        assert.equal(change.insert.fields.relatedModule, 'leads');
        assert.equal(change.insert.fields.startAt, START.toISOString());
        assert.equal(change.insert.fields.organizationName, 'SUNRISE HOTELS');
        assert.equal(change.insert.fields.reminder, '15 minutes before');
        assert.deepEqual(Object.keys(change), ['insert']);
    });

    it('changes nothing when the activity is in line (idempotent)', () => {
        assert.deepEqual(planFollowUpChange(openFa(), desired(), NO_OUTCOME, NOW), {});
        assert.equal(needsReconcile(lead(), openFa(), context(), NOW), false);
        assert.equal(needsReconcile(lead(), null, context(), NOW), true);
    });

    it('patches only what differs: times, type, owner, creator, organization', () => {
        const moved = planFollowUpChange(openFa({ startAt: new Date('2026-12-02T05:30:00.000Z'), endAt: new Date('2026-12-02T06:00:00.000Z') }), desired(), NO_OUTCOME, NOW);
        assert.deepEqual(moved, { patch: { id: 'fa1', fields: { allDay: false, startAt: START.toISOString(), endAt: END.toISOString() } } });

        const reowned = planFollowUpChange(openFa(), desired(lead({ assignedTo: 'meena', followupType: 'Visit', organizationName: 'Sunrise Group' })), NO_OUTCOME, NOW);
        assert.deepEqual(reowned.patch?.fields, { followupType: 'Visit', assignedTo: 'meena', organizationName: 'Sunrise Group' });

        const sameOrgOtherCase = planFollowUpChange(openFa({ organizationName: 'sunrise hotels' }), desired(), NO_OUTCOME, NOW);
        assert.deepEqual(sameOrgOtherCase, {});

        const realigned = planFollowUpChange(openFa({ createdBy: 'system' }), desired(), NO_OUTCOME, NOW);
        assert.deepEqual(realigned, { patch: { id: 'fa1', fields: {}, createdBy: 'asha' } });
    });

    it('rewrites the subject only when its derived text changed with this save', () => {
        const edited = openFa({ subject: 'Call Mr Shah about the revised quote' });
        assert.deepEqual(planFollowUpChange(edited, desired(), NO_OUTCOME, NOW), {});
        const renamed = lead({ name: 'Sunrise Hotels Pvt Ltd' }, { derivedSubjectBefore: 'Call follow-up: LD-0012 Sunrise Hotels' });
        assert.deepEqual(planFollowUpChange(edited, desired(renamed), NO_OUTCOME, NOW).patch?.fields, { subject: 'Call follow-up: LD-0012 Sunrise Hotels Pvt Ltd' });
        const unchanged = lead({}, { derivedSubjectBefore: 'Call follow-up: LD-0012 Sunrise Hotels' });
        assert.deepEqual(planFollowUpChange(edited, desired(unchanged), NO_OUTCOME, NOW), {});
    });

    it('cancels the open activity when the record is closed, deleted or has no follow-up', () => {
        assert.deepEqual(planFollowUpChange(openFa(), desired(lead({ status: 'Dead' })), NO_OUTCOME, NOW), { cancel: { id: 'fa1' } });
        assert.deepEqual(planFollowUpChange(openFa(), desired(lead({ isDeleted: true })), NO_OUTCOME, NOW), { cancel: { id: 'fa1' } });
        assert.deepEqual(planFollowUpChange(openFa(), desired(lead({ nextFollowupDate: null })), NO_OUTCOME, NOW), { cancel: { id: 'fa1' } });
        assert.deepEqual(planFollowUpChange(null, desired(lead({ status: 'Dead' })), NO_OUTCOME, NOW), {});
    });

    it('a recorded response with a new slot completes the open activity (times kept) before inserting the next', () => {
        const next = lead({ nextFollowupDate: new Date('2026-12-10T00:00:00.000Z') });
        // Recorded early: the open activity (3 Dec) completes today without moving to now.
        const change = planFollowUpChange(openFa(), desired(next), recorded('new'), NOW);
        assert.deepEqual(change.complete, { id: 'fa1', fields: { status: 'Completed', customerResponse: 'Interested', remarks: 'Asked for a revised quote' } });
        assert.equal(change.insert?.fields.startAt, '2026-12-10T05:30:00.000Z');
        assert.equal(change.cancel, undefined);
        assert.equal(change.patch, undefined);
        assert.deepEqual(Object.keys(change), ['complete', 'insert']);
    });

    it('a recorded response that keeps the slot logs a separate Completed activity', () => {
        const change = planFollowUpChange(openFa(), desired(), recorded('keep', 'ok'), NOW);
        assert.equal(change.complete, undefined);
        assert.equal(change.patch, undefined);
        assert.ok(change.logCompleted);
        assert.equal(change.logCompleted.fields.status, 'Completed');
        assert.equal(change.logCompleted.fields.customerResponse, 'Interested');
        assert.equal(change.logCompleted.fields.remarks, undefined, 'remarks under 3 characters are not stored');
        assert.equal(change.logCompleted.fields.startAt, NOW.toISOString());
        assert.equal(change.logCompleted.createdBy, 'asha');
    });

    it('a recorded response with no open activity logs it, then inserts the next one', () => {
        const change = planFollowUpChange(null, desired(), recorded('new'), NOW);
        assert.ok(change.logCompleted);
        assert.ok(change.insert);
    });

    it("planner: a 'closed' outcome completes the open activity and plans no new one; none (as at Closed Won / Lost) cancels it", () => {
        const won = opportunityFollowUpTarget({ ...OPP_ROW, salesStage: 'Closed Won' });
        const change = planFollowUpChange(openFa(), desiredFollowUp(won, context(), IST), recorded('closed'), NOW);
        assert.equal(change.complete?.fields.status, 'Completed');
        assert.equal(change.insert, undefined);
        assert.equal(change.cancel, undefined);
        // Closed Won without a response: Cancelled.
        assert.deepEqual(planFollowUpChange(openFa(), desiredFollowUp(won, context(), IST), NO_OUTCOME, NOW), { cancel: { id: 'fa1' } });
    });

    it('links an opportunity activity to its organization and contact by id', () => {
        const target = opportunityFollowUpTarget(OPP_ROW);
        const insert = planFollowUpChange(null, desiredFollowUp(target, context(), IST), NO_OUTCOME, NOW).insert;
        assert.equal(insert?.fields.organizationId, 'org1');
        assert.equal(insert?.fields.contactId, 'c1');
        assert.equal(insert?.fields.allDay, true);
        const moved = planFollowUpChange(
            openFa({ allDay: true, startAt: new Date('2026-12-02T18:30:00.000Z'), endAt: new Date('2026-12-03T18:30:00.000Z'), assignedTo: 'palak', createdBy: 'palak', organizationId: 'org1', organizationName: 'Sunrise Hotels', contactId: 'c2', contact: 'Old' }),
            desiredFollowUp(target, context(), IST),
            NO_OUTCOME,
            NOW,
        );
        assert.deepEqual(moved.patch?.fields, { contactId: 'c1', contact: 'Asha Rao' });
    });
});

describe('opportunityFollowUpOutcome', () => {
    const before = { nextFollowupDate: '2026-12-03', nextFollowupTime: '11:00 AM' };
    const plan = (over = {}) => ({ customerResponse: 'Interested', nextFollowupDate: '2026-12-03', nextFollowupTime: '11:00 AM', followUpCleared: false, ...over });

    it('maps a recorded response to keep / new / closed, and to none at a closed stage or without a response', () => {
        assert.deepEqual(opportunityFollowUpOutcome(true, plan(), 'Proposal', before, 'r'), { kind: 'recorded', response: 'Interested', remarks: 'r', decision: 'keep' });
        assert.equal((opportunityFollowUpOutcome(true, plan({ nextFollowupDate: '2026-12-09' }), 'Proposal', before, '') as { decision: string }).decision, 'new');
        assert.equal((opportunityFollowUpOutcome(true, plan({ followUpCleared: true, nextFollowupDate: null }), 'Proposal', before, '') as { decision: string }).decision, 'closed');
        assert.deepEqual(opportunityFollowUpOutcome(true, plan(), 'Closed Lost', before, ''), NO_OUTCOME);
        assert.deepEqual(opportunityFollowUpOutcome(false, plan(), 'Proposal', before, ''), NO_OUTCOME);
    });
});

describe('calendar → record (P2-5, inert)', () => {
    it('formats 12-hour times', () => {
        assert.equal(formatTimeOfDay(0), '12:00 AM');
        assert.equal(formatTimeOfDay(11 * 60 + 5), '11:05 AM');
        assert.equal(formatTimeOfDay(12 * 60), '12:00 PM');
        assert.equal(formatTimeOfDay(23 * 60 + 59), '11:59 PM');
    });

    it('writes back the moved slot; an all-day move keeps a time the record had', () => {
        assert.deepEqual(slotFromCalendar({ allDay: false, startAt: new Date('2026-12-04T09:00:00.000Z') }, { nextFollowupTime: '11:00 AM' }, IST), {
            nextFollowupDate: '2026-12-04',
            nextFollowupTime: '02:30 PM',
            keptTime: false,
        });
        assert.deepEqual(slotFromCalendar({ allDay: true, startAt: new Date('2026-12-04T18:30:00.000Z') }, { nextFollowupTime: '11:00 AM' }, IST), {
            nextFollowupDate: '2026-12-05',
            keptTime: true,
        });
        assert.deepEqual(slotFromCalendar({ allDay: true, startAt: new Date('2026-12-04T18:30:00.000Z') }, { nextFollowupTime: null }, IST), {
            nextFollowupDate: '2026-12-05',
            nextFollowupTime: '',
            keptTime: false,
        });
    });
});

describe('retryOnceOnUniqueViolation (D45)', () => {
    it('runs the transaction again once on a unique-index refusal, never on other errors', async () => {
        let runs = 0;
        const value = await retryOnceOnUniqueViolation(async () => {
            runs++;
            if (runs === 1) throw Object.assign(new Error('unique'), { code: 'P2002' });
            return 'ok';
        });
        assert.equal(value, 'ok');
        assert.equal(runs, 2);

        runs = 0;
        await assert.rejects(
            retryOnceOnUniqueViolation(async () => {
                runs++;
                throw Object.assign(new Error('unique'), { code: 'P2002' });
            }),
            /unique/,
        );
        assert.equal(runs, 2);

        runs = 0;
        await assert.rejects(
            retryOnceOnUniqueViolation(async () => {
                runs++;
                throw new Error('other');
            }),
            /other/,
        );
        assert.equal(runs, 1);
    });
});

describe('reconcileRecordFollowUp (system write path)', () => {
    const USERS = [
        { username: 'asha', fullName: 'Asha Rao', isActive: true },
        { username: 'palak', fullName: 'Palak Shah', isActive: true },
        { username: 'ravi', fullName: 'Ravi Kumar', isActive: false },
    ];
    const LEADS = [{ id: 'l1', leadCode: 'LD-0012', name: 'Sunrise Hotels', organizationName: 'SUNRISE HOTELS', assignedTo: 'ravi', createdBy: 'asha', isDeleted: false }];
    /** A slot in the future, so the insert is an ordinary upcoming activity. */
    const future = lead({ nextFollowupDate: new Date('2027-01-05T00:00:00.000Z') });
    const reconcile = (target: FollowUpTarget, outcome: FollowUpOutcome = NO_OUTCOME, ctx: FollowUpContext = context()) =>
        runInTransaction((tx) => reconcileRecordFollowUp(tx, target, outcome, 'palak', NOW, { context: ctx, notify: false }));

    afterEach(() => restoreActivityDouble());

    it("creates the follow-up activity for an inactive owner, with the record's creator and origin 'followup', audited", async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        const { rows } = await reconcile(future);
        assert.equal(rows.length, 1);
        assert.equal(state.activities.length, 1);
        const fa = state.activities[0];
        assert.equal(fa.origin, 'followup');
        assert.equal(fa.status, 'Planned');
        assert.equal(fa.assignedTo, 'ravi', 'the inactive owner is kept');
        assert.equal(fa.createdBy, 'asha', 'createdBy is the record creator, not the actor');
        assert.equal(fa.followupType, 'Call');
        assert.equal(fa.relatedModule, 'leads');
        assert.equal(fa.relatedId, 'l1');
        assert.equal(fa.relatedCode, 'LD-0012');
        assert.equal(fa.startAt?.toISOString(), '2027-01-05T05:30:00.000Z');
        assert.equal(state.audits.length, 1);
        assert.equal(state.audits[0].entityType, 'Activity');
        assert.equal(state.audits[0].action, 'CREATE');
        assert.equal(state.audits[0].changedBy, 'palak');
        assert.deepEqual(lockedFieldsFor(fa).includes('startAt'), true);

        // Running it again changes nothing.
        const again = await reconcile(future);
        assert.equal(again.rows.length, 0);
        assert.equal(state.activities.length, 1);
        assert.equal(state.audits.length, 1);
    });

    it('moves the open activity with the record, then cancels it when the record closes', async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        await reconcile(future);
        const id = state.activities[0].id;
        await reconcile(lead({ nextFollowupDate: new Date('2027-01-06T00:00:00.000Z'), nextFollowupTime: '' }));
        assert.equal(state.activities.length, 1);
        assert.equal(state.activities[0].id, id);
        assert.equal(state.activities[0].allDay, true);
        assert.equal(state.audits.at(-1)?.action, 'UPDATE');
        assert.ok(state.locks.some((key) => key.includes(id)), 'the open activity is locked before it is patched');

        await reconcile(lead({ status: 'Dead', nextFollowupDate: new Date('2027-01-06T00:00:00.000Z') }));
        assert.equal(state.activities[0].status, 'Cancelled');
    });

    it('a response with a new slot completes the open activity and creates the next', async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        await reconcile(future);
        await reconcile(lead({ nextFollowupDate: new Date('2027-01-12T00:00:00.000Z') }), recorded('new'));
        assert.equal(state.activities.length, 2);
        const [done, next] = state.activities;
        assert.equal(done.status, 'Completed');
        assert.equal(done.customerResponse, 'Interested');
        assert.equal(done.startAt?.toISOString(), '2027-01-05T05:30:00.000Z', 'early completion keeps the slot');
        assert.equal(next.status, 'Planned');
        assert.equal(next.origin, 'followup');
        assert.equal(next.startAt?.toISOString(), '2027-01-12T05:30:00.000Z');
    });

    it('does nothing while the followUpActivities switch is off, and refuses to run without a context', async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        const { rows } = await reconcile(future, NO_OUTCOME, context({ followUpActivities: false }));
        assert.equal(rows.length, 0);
        assert.equal(state.activities.length, 0);
        assert.equal(state.calls.filter((c) => c.startsWith('activity.')).length, 0);
        await assert.rejects(
            runInTransaction((tx) => reconcileRecordFollowUp(tx, future, NO_OUTCOME, 'palak', NOW, undefined as never)),
            /FollowUpContext/,
        );
    });

    it("doesn't send a late reminder for a slot that already passed; one whose slot is still ahead stays armed", async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        // 10:00 IST today: the slot passed two hours ago (the backfill on deploy day, or a follow-up saved in the past).
        await reconcile(lead({ nextFollowupDate: new Date('2026-11-26T00:00:00.000Z'), nextFollowupTime: '10:00 AM' }));
        const fa = state.activities[0];
        assert.equal(fa.remindAt?.toISOString(), '2026-11-26T04:15:00.000Z');
        assert.equal(fa.reminderSentAt?.toISOString(), NOW.toISOString(), 'stored as sent: no reminder burst');

        // Moved to 12:10 IST: the reminder (11:55) is due, but the follow-up is still ahead, so it fires as usual.
        await reconcile(lead({ nextFollowupDate: new Date('2026-11-26T00:00:00.000Z'), nextFollowupTime: '12:10 PM' }));
        assert.equal(state.activities[0].remindAt?.toISOString(), '2026-11-26T06:25:00.000Z');
        const sentAt = () => state.activities[0].reminderSentAt?.toISOString() ?? null;
        assert.equal(sentAt(), null);

        // All day today: 09:00 IST already passed.
        await reconcile(lead({ nextFollowupDate: new Date('2026-11-26T00:00:00.000Z'), nextFollowupTime: '' }));
        assert.equal(state.activities[0].allDay, true);
        assert.equal(sentAt(), NOW.toISOString());
    });

    it('keeps the deleted organization / contact an opportunity still points at (no 400, the save goes through)', async () => {
        const opportunity = { ...OPP_ROW, nextFollowupDate: new Date('2027-01-05T00:00:00.000Z'), productCategoryJson: null };
        const state = installActivityDouble({
            users: USERS,
            opportunities: [opportunity],
            organizations: [{ id: 'org1', organizationName: 'Sunrise Hotels', isDeleted: true }],
            contacts: [{ id: 'c1', name: 'Asha Rao', organizationId: 'org1', isDeleted: true }],
        });
        const target = opportunityFollowUpTarget(opportunity);
        // First slot: inserts the follow-up activity.
        await reconcile(target);
        // A response that keeps the slot logs a Completed activity (another insert).
        await reconcile(target, recorded('keep'));
        // A response with a new slot completes it and inserts the next one.
        await reconcile(opportunityFollowUpTarget({ ...opportunity, nextFollowupDate: new Date('2027-01-12T00:00:00.000Z') }), recorded('new'));
        assert.equal(state.activities.length, 3);
        for (const row of state.activities) {
            assert.equal(row.organizationId, 'org1');
            assert.equal(row.contactId, 'c1');
        }
        assert.deepEqual(
            state.activities.map((row) => row.status),
            ['Completed', 'Completed', 'Planned'],
        );
    });

    it('cancelRecordFollowUps cancels the open activities of deleted records', async () => {
        const state = installActivityDouble({ users: USERS, leads: LEADS });
        await reconcile(future);
        const { rows } = await runInTransaction((tx) => cancelRecordFollowUps(tx, 'leads', ['l1', 'l2'], 'palak', NOW, { context: context(), notify: false }));
        assert.equal(rows.length, 1);
        assert.equal(state.activities[0].status, 'Cancelled');
    });
});

describe('renameOrganizationFollowUps', () => {
    afterEach(() => restoreActivityDouble());

    const USERS = [{ username: 'palak', fullName: 'Palak Shah', isActive: true }];
    const opp = (over: Partial<OpportunityFollowUpRow> = {}) => ({
        ...OPP_ROW,
        organizationName: 'ACME INDUSTRIES',
        nextFollowupDate: new Date('2027-01-05T00:00:00.000Z'),
        productCategoryJson: null,
        ...over,
    });
    const fa = (id: string, relatedId: string, subject: string) =>
        blankActivity({
            id,
            subject,
            assignedTo: 'palak',
            createdBy: 'palak',
            followupType: 'Call',
            status: 'Planned',
            origin: 'followup',
            relatedModule: 'opportunities',
            relatedId,
            organizationId: 'org1',
            organizationName: 'ACME INDUSTRIES',
            startAt: new Date('2027-01-05T00:00:00.000Z'),
            allDay: true,
        });

    it("rewrites the subject of an unnamed opportunity's follow-up activity; an edited subject or a named opportunity is kept", async () => {
        const state = installActivityDouble({
            users: USERS,
            organizations: [{ id: 'org1', organizationName: 'ACME INDUSTRIES', isDeleted: false }],
            opportunities: [opp({ id: 'o1', opportunityCode: 'OPP-0009' }), opp({ id: 'o2', opportunityCode: 'OPP-0010' }), opp({ id: 'o3', opportunityCode: 'OPP-0011', opportunityName: 'Kitchen ERP' })],
            activities: [
                fa('fa1', 'o1', 'Call follow-up: OPP-0009 ACME TRADERS'),
                fa('fa2', 'o2', 'Bring the samples'),
                fa('fa3', 'o3', 'Call follow-up: OPP-0011 Kitchen ERP'),
            ],
        });
        const { rows } = await runInTransaction((tx) => renameOrganizationFollowUps(tx, 'org1', 'ACME TRADERS', 'palak', NOW, { context: context(), notify: false }));
        assert.equal(rows.length, 1);
        assert.deepEqual(
            state.activities.map((row) => row.subject),
            ['Call follow-up: OPP-0009 ACME INDUSTRIES', 'Bring the samples', 'Call follow-up: OPP-0011 Kitchen ERP'],
        );
        assert.equal(state.audits.at(-1)?.action, 'UPDATE');
        assert.ok(state.locks.some((key) => key.includes('o1')), "the opportunity's lock is taken");

        // Switch off: nothing is written.
        const off = await runInTransaction((tx) =>
            renameOrganizationFollowUps(tx, 'org1', 'ACME INDUSTRIES', 'palak', NOW, { context: context({ followUpActivities: false }), notify: false }),
        );
        assert.equal(off.rows.length, 0);
    });
});

describe('follow-up activity locks (real lockFor)', () => {
    const USERS = [{ username: 'palak', fullName: 'Palak Shah', isActive: true }];
    const PALAK = { id: 1, username: 'palak', role: 'user' };
    const START_AT = new Date(Date.now() + 3 * 24 * 3_600_000);
    const fa = (over = {}) =>
        blankActivity({
            id: 'fa1',
            subject: 'Call follow-up: LD-0012 Sunrise Hotels',
            assignedTo: 'palak',
            createdBy: 'palak',
            followupType: 'Call',
            origin: 'followup',
            relatedModule: 'leads',
            relatedId: 'l1',
            relatedCode: 'LD-0012',
            relatedTo: 'Sunrise Hotels',
            startAt: START_AT,
            endAt: new Date(START_AT.getTime() + 30 * 60_000),
            ...over,
        });
    const crm = blankActivity({ id: 'a2', subject: 'Demo', assignedTo: 'palak', createdBy: 'palak', startAt: START_AT, endAt: new Date(START_AT.getTime() + 3_600_000) });
    const locked409 = (err: unknown) => err instanceof HttpError && err.statusCode === 409 && err.code === FOLLOW_UP_ACTIVITY_LOCKED;

    afterEach(() => restoreActivityDouble());

    it('locks the follow-up fields of every follow-up activity and none of a CRM one', () => {
        assert.deepEqual(lockedFieldsFor(fa()), ['followupType', 'startAt', 'endAt', 'allDay', 'status', 'assignedTo', 'relatedModule', 'relatedId', 'relatedTo']);
        assert.deepEqual(lockedFieldsFor(fa({ status: 'Completed' })).includes('status'), true);
        assert.deepEqual(lockedFieldsFor(crm), []);
    });

    it('update refuses a locked field with 409 FOLLOW_UP_ACTIVITY_LOCKED; subject, location and remarks pass', async () => {
        const state = installActivityDouble({ users: USERS, activities: [fa()] });
        await assert.rejects(activityService.update('fa1', { status: 'Completed' }, PALAK), locked409);
        await assert.rejects(activityService.update('fa1', { startAt: new Date(START_AT.getTime() + 3_600_000).toISOString(), endAt: '' }, PALAK), locked409);
        assert.equal(state.activities[0].status, 'Planned');
        const saved = await activityService.update('fa1', { subject: 'Call Mr Shah', location: 'Phone', remarks: 'Bring the quote' }, PALAK);
        assert.equal(saved.subject, 'Call Mr Shah');
        assert.deepEqual(saved.lockedFields.includes('startAt'), true);
        assert.equal(saved.origin, 'followup');
    });

    it("refuses to delete one, and bulk delete skips it with the record's reason", async () => {
        const state = installActivityDouble({ users: USERS, activities: [fa(), crm] });
        await assert.rejects(activityService.remove('fa1', PALAK), locked409);
        const result = await activityService.bulkRemove(['fa1', 'a2'], PALAK);
        assert.equal(result.deleted, 1);
        assert.deepEqual(
            (result.skipped ?? []).map((s) => s.id),
            ['fa1'],
        );
        assert.match(result.skipped?.[0]?.reason ?? '', /LD-0012/);
        assert.equal(state.activities.find((a) => a.id === 'fa1')?.isDeleted, false);
        assert.equal(state.activities.find((a) => a.id === 'a2')?.isDeleted, true);
    });
});
