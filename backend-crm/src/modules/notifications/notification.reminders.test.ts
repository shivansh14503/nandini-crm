import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import {
    activityWhen,
    assignmentKey,
    assignmentText,
    contractRenewalKey,
    contractRenewalNotification,
    contractRenewalText,
    invitationKey,
    invitationText,
    isReminderDue,
    isStaleReminder,
    notificationPurgeWhere,
    notifyActivityParticipants,
    planParticipantNotifications,
    reminderCandidates,
    reminderJobId,
    reminderKey,
    reminderRecipients,
    reminderText,
    renewalSweepWhere,
    RENEWAL_WINDOW_DAYS,
    type ActivityTextRow,
    type ParticipantRow,
    type ReminderDb,
} from './notification.reminders.js';

const TZ = 'Asia/Kolkata';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 25 Nov 2026, 10:15 IST. */
const now = new Date('2026-11-25T04:45:00.000Z');

const activity: ActivityTextRow = {
    id: 'a1',
    subject: 'Demo with ACME',
    followupType: 'Meeting',
    // 10:30–11:30 IST
    startAt: new Date('2026-11-25T05:00:00.000Z'),
    endAt: new Date('2026-11-25T06:00:00.000Z'),
    allDay: false,
    timeZone: TZ,
    location: null,
    relatedTo: 'Ramesh',
    relatedCode: 'LD-0012',
};

describe('reminder recipients', () => {
    const audience = {
        assignedTo: 'palak',
        attendees: [
            { kind: 'user', username: 'Ravi', responseStatus: 'accepted' },
            { kind: 'user', username: 'asha', responseStatus: 'declined' },
            { kind: 'user', username: 'mohan', responseStatus: 'needsAction' },
            { kind: 'user', username: 'PALAK', responseStatus: 'tentative' },
            { kind: 'contact', username: null, responseStatus: 'accepted' },
            { kind: 'email', username: null, responseStatus: 'needsAction' },
        ],
    };

    it('looks up the owner and the colleagues who have not declined, each once', () => {
        assert.deepEqual(reminderCandidates(audience), ['palak', 'Ravi', 'mohan']);
    });

    it('keeps active users only, with the spelling of their account', () => {
        assert.deepEqual(reminderRecipients(audience, ['Palak', 'ravi']), ['Palak', 'ravi']);
        assert.deepEqual(reminderRecipients(audience, []), []);
    });

    it('never includes declined colleagues, contacts or outside emails', () => {
        assert.deepEqual(reminderRecipients(audience, ['palak', 'asha', 'Ravi', 'mohan']), ['palak', 'Ravi', 'mohan']);
    });
});

describe('due and stale policy', () => {
    const due = { followupType: 'Call', status: 'Planned', isDeleted: false, remindAt: new Date(now.getTime() - MINUTE), reminderSentAt: null };

    it('is due once remindAt is reached on a live, Planned, unsent activity', () => {
        assert.equal(isReminderDue(due, now), true);
        assert.equal(isReminderDue({ ...due, remindAt: now }, now), true);
        assert.equal(isReminderDue({ ...due, remindAt: new Date(now.getTime() + MINUTE) }, now), false);
        assert.equal(isReminderDue({ ...due, reminderSentAt: now }, now), false);
        assert.equal(isReminderDue({ ...due, status: 'Completed' }, now), false);
        assert.equal(isReminderDue({ ...due, isDeleted: true }, now), false);
        assert.equal(isReminderDue({ ...due, followupType: 'Note' }, now), false);
        assert.equal(isReminderDue({ ...due, remindAt: null }, now), false);
    });

    it('is stale only when more than 6 hours late and the activity has ended', () => {
        const late = { remindAt: new Date(now.getTime() - 7 * HOUR), startAt: new Date(now.getTime() - 6 * HOUR), endAt: new Date(now.getTime() - 5 * HOUR) };
        assert.equal(isStaleReminder(late, now), true);
        // Still running (a long workshop): not stale.
        assert.equal(isStaleReminder({ ...late, endAt: new Date(now.getTime() + HOUR) }, now), false);
        // Only 5 hours late: delivered.
        assert.equal(isStaleReminder({ ...late, remindAt: new Date(now.getTime() - 5 * HOUR) }, now), false);
        // A Task (no end): its start decides.
        assert.equal(isStaleReminder({ remindAt: late.remindAt, startAt: late.startAt, endAt: null }, now), true);
    });
});

describe('dedupe keys and job ids', () => {
    const at = new Date('2026-11-25T04:45:00.000Z');

    it('builds one key per event and recipient (usernames lowercased)', () => {
        assert.equal(reminderKey('a1', at, 'Palak'), `activity_reminder:a1:${at.getTime()}:palak`);
        assert.equal(contractRenewalKey('c1', '2026-11-25T10:00', 'Ravi'), 'contract_renewal:c1:2026-11-25T10:00:ravi');
        assert.equal(invitationKey('a1', at, 'asha'), `activity_invited:a1:${at.getTime()}:asha`);
    });

    it('gives each save its own assignment key, so B → C → B tells B twice', () => {
        const first = assignmentKey('a1', new Date('2026-11-25T04:00:00.000Z'), 'b');
        const back = assignmentKey('a1', new Date('2026-11-25T04:10:00.000Z'), 'b');
        assert.notEqual(first, back);
    });

    it('a reschedule is a new reminder key', () => {
        assert.notEqual(reminderKey('a1', at, 'palak'), reminderKey('a1', new Date(at.getTime() + HOUR), 'palak'));
    });

    it('job ids carry the reminder time and never contain a colon', () => {
        const id = reminderJobId('6f1c2a3e-0000-4000-8000-000000000001', at);
        assert.equal(id, `reminder-6f1c2a3e-0000-4000-8000-000000000001-${at.getTime()}`);
        assert.equal(id.includes(':'), false);
    });
});

describe('notification texts', () => {
    it('reminds with the start time and how soon, then location and related record', () => {
        assert.deepEqual(reminderText(activity, now), { title: 'Reminder: Demo with ACME', body: 'Starts at 10:30 AM (in 15 min) · Related to LD-0012 Ramesh' });
        assert.equal(reminderText({ ...activity, location: 'ACME office' }, now).body, 'Starts at 10:30 AM (in 15 min) · ACME office · Related to LD-0012 Ramesh');
    });

    it('names the day when the activity is not today, says Due for tasks', () => {
        const tomorrow = { ...activity, startAt: new Date(activity.startAt!.getTime() + DAY), endAt: null };
        assert.equal(reminderText(tomorrow, now).body, 'Starts tomorrow at 10:30 AM (in 1 day) · Related to LD-0012 Ramesh');
        const later = { ...activity, startAt: new Date(activity.startAt!.getTime() + 3 * DAY) };
        assert.equal(reminderText(later, now).body, 'Starts on Sat 28 Nov at 10:30 AM (in 3 days) · Related to LD-0012 Ramesh');
        const task = { ...activity, followupType: 'Task', relatedCode: null, relatedTo: null };
        assert.equal(reminderText(task, now).body, 'Due at 10:30 AM (in 15 min)');
    });

    it('says the day for all-day activities', () => {
        // 26 Nov 00:00 IST → 27 Nov 00:00 IST
        const allDay = { ...activity, allDay: true, startAt: new Date('2026-11-25T18:30:00.000Z'), endAt: new Date('2026-11-26T18:30:00.000Z') };
        assert.equal(reminderText(allDay, now).body, 'All day tomorrow · Related to LD-0012 Ramesh');
        assert.equal(activityWhen(allDay, now), 'All day tomorrow');
        const multi = { ...allDay, endAt: new Date('2026-11-28T18:30:00.000Z') };
        assert.equal(activityWhen(multi, now), 'All day, Thu 26 Nov – Sat 28 Nov');
    });

    it('builds assignment and invitation texts with who did it', () => {
        assert.deepEqual(assignmentText(activity, 'Palak Sharma', now), {
            title: 'Assigned to you: Demo with ACME',
            body: 'Meeting · Today, 10:30 AM · Related to LD-0012 Ramesh · by Palak Sharma',
        });
        assert.deepEqual(invitationText({ ...activity, location: 'Zoom' }, 'Palak Sharma', now), {
            title: 'Invitation: Demo with ACME',
            body: 'Today, 10:30 AM · Zoom · Related to LD-0012 Ramesh · from Palak Sharma',
        });
        // Notes have no time.
        assert.equal(assignmentText({ ...activity, followupType: 'Note', startAt: null, endAt: null }, 'Palak', now).body, 'Note · Related to LD-0012 Ramesh · by Palak');
    });

    it('describes a contract renewal from its wall-clock reminder', () => {
        const contract = { id: 'c1', contractNumber: 'CON-0007', contractTitle: 'Tally TSS', organizationName: 'ACME LTD', renewalReminderDate: new Date('2026-11-25T10:00:00.000Z') };
        assert.deepEqual(contractRenewalText(contract, TZ), {
            title: 'Contract renewal due: Tally TSS',
            body: 'CON-0007 · ACME LTD · Reminder set for Wed 25 Nov, 10:00 AM',
        });
        const row = contractRenewalNotification(contract, 'ravi', TZ);
        assert.equal(row.dedupeKey, 'contract_renewal:c1:2026-11-25T10:00:ravi');
        // 10:00 IST as a true instant.
        assert.equal(row.dueAt?.toISOString(), '2026-11-25T04:30:00.000Z');
        assert.equal(row.entityModule, 'contracts');
    });
});

describe('contract renewal window', () => {
    const nowWall = new Date('2026-11-25T10:15:00.000Z');
    const where = renewalSweepWhere(nowWall);
    const window = where.renewalReminderDate as { gt: Date; lte: Date };

    it('covers the last 7 days up to now, as wall clocks', () => {
        assert.equal(window.lte.toISOString(), '2026-11-25T10:15:00.000Z');
        assert.equal(window.gt.toISOString(), new Date(nowWall.getTime() - RENEWAL_WINDOW_DAYS * DAY).toISOString());
    });

    it('leaves out Expired and deleted contracts', () => {
        assert.deepEqual(where.status, { not: 'Expired' });
        assert.equal(where.isDeleted, false);
    });

    it('re-arms when the reminder date changes (another key)', () => {
        assert.notEqual(contractRenewalKey('c1', '2026-11-25T10:00', 'ravi'), contractRenewalKey('c1', '2026-12-01T10:00', 'ravi'));
    });
});

describe('notificationPurgeWhere', () => {
    it('deletes read rows past the retention and any row past twice that', () => {
        const where = notificationPurgeWhere(now, 90);
        assert.deepEqual(where, {
            OR: [
                { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 90 * DAY) } },
                { createdAt: { lt: new Date(now.getTime() - 180 * DAY) } },
            ],
        });
    });
});

const participant = (overrides: Partial<ParticipantRow> = {}): ParticipantRow => ({
    ...activity,
    status: 'Planned',
    assignedTo: 'palak',
    isDeleted: false,
    updatedAt: new Date('2026-11-25T04:00:00.000Z'),
    attendees: [],
    ...overrides,
});

describe('planParticipantNotifications', () => {
    it('tells a new owner assigned by someone else, not one who took it themselves', () => {
        assert.deepEqual(planParticipantNotifications(null, participant({ assignedTo: 'ravi' }), 'palak'), { assignee: 'ravi', invitees: [] });
        assert.deepEqual(planParticipantNotifications(null, participant(), 'Palak'), { assignee: null, invitees: [] });
        assert.equal(planParticipantNotifications(participant(), participant({ assignedTo: 'ravi' }), 'palak').assignee, 'ravi');
        // Unchanged owner (case aside): nobody.
        assert.equal(planParticipantNotifications(participant({ assignedTo: 'ravi' }), participant({ assignedTo: 'RAVI' }), 'palak').assignee, null);
    });

    it('tells colleagues newly invited by someone else, on Planned non-Note activities', () => {
        const before = participant({ attendees: [{ kind: 'user', username: 'asha' }] });
        const after = participant({
            attendees: [
                { kind: 'user', username: 'ASHA' },
                { kind: 'user', username: 'mohan' },
                { kind: 'user', username: 'palak' },
                { kind: 'contact', username: null },
            ],
        });
        assert.deepEqual(planParticipantNotifications(before, after, 'palak').invitees, ['mohan']);
        assert.deepEqual(planParticipantNotifications(before, { ...after, status: 'Completed' }, 'palak').invitees, []);
        assert.deepEqual(planParticipantNotifications(null, { ...after, followupType: 'Note' }, 'ravi').invitees, []);
        // The actor inviting themselves is not told.
        assert.deepEqual(planParticipantNotifications(before, after, 'mohan').invitees, []);
    });

    it('tells nobody about a deleted activity', () => {
        assert.deepEqual(planParticipantNotifications(null, participant({ assignedTo: 'ravi', isDeleted: true }), 'palak'), { assignee: null, invitees: [] });
    });
});

describe('notifyActivityParticipants', () => {
    it('notifies active users only, with the actor name and per-save keys', async () => {
        const created: { dedupeKey: string; username: string; kind: string; body: string | null; actor: string | null }[] = [];
        const db = {
            user: {
                async findMany() {
                    return [
                        { username: 'palak', fullName: 'Palak Sharma', isActive: true },
                        { username: 'ravi', fullName: 'Ravi K', isActive: true },
                        { username: 'mohan', fullName: 'Mohan', isActive: false },
                    ];
                },
            },
            notification: {
                async findMany() {
                    return [];
                },
                async createMany({ data }: { data: typeof created }) {
                    created.push(...data);
                    return { count: data.length };
                },
            },
        } as unknown as ReminderDb;
        const actor: AuthUser = { id: 1, username: 'palak', role: 'Admin' };
        const after = participant({ assignedTo: 'ravi', attendees: [{ kind: 'user', username: 'mohan' }] });
        const count = await notifyActivityParticipants(null, after, actor, db, now);
        assert.equal(count, 1);
        assert.equal(created.length, 1);
        assert.equal(created[0].username, 'ravi');
        assert.equal(created[0].kind, 'activity_assigned');
        assert.equal(created[0].actor, 'palak');
        assert.equal(created[0].dedupeKey, assignmentKey('a1', after.updatedAt, 'ravi'));
        assert.match(created[0].body ?? '', /by Palak Sharma$/);
    });
});
