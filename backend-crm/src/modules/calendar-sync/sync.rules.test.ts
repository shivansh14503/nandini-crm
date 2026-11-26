import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLastAttempt, pushRetryDelay } from '../../jobs/workers/calendarSync.worker.js';
import { blankLink } from '../activities/testing/activityDouble.js';
import { LEASE_TTL_MS } from './sync.constants.js';
import { claimLease } from './sync.lease.js';
import { isInsideSyncWindow } from './sync.maintenance.js';
import { planMerge } from './sync.merge.js';
import { invitesHeldNotification, isoWeekKey, secretExpiringNotifications, syncErrorNotification } from './sync.notifications.js';
import { planPush, shouldSendUpdates, type PlanInput } from './sync.plan.js';
import type { CrmShape, ProviderShape, SyncBase } from './sync.shapes.js';
import { calendarViewOf } from './sync.view.js';

/** Pure rules of the push engine: plan, merge, notifications, view, lease, sync window, worker retry helpers. */

const crm = (over: Partial<CrmShape> = {}): CrmShape => ({
    subject: 'Demo',
    when: { allDay: false, start: '2026-12-01T04:30:00.000Z', end: '2026-12-01T05:30:00.000Z' },
    location: 'Pune',
    status: 'active',
    attendees: {},
    reminderMinutes: null,
    description: '',
    ...over,
});
const provider = (over: Partial<ProviderShape> = {}): ProviderShape => ({ ...crm(), attendees: {}, organizerEmail: 'asha@x.com', ...over }) as ProviderShape;

const plan = (over: Partial<PlanInput> = {}, link: Partial<PlanInput['link']> = {}, activity: Partial<PlanInput['activity']> = {}) =>
    planPush({
        activity: { isDeleted: false, status: 'Planned', hasSchedule: true, externalOrganizer: false, ...activity },
        link: { state: 'synced', externalEventId: 'evt', base: { crm: crm(), provider: provider() }, ...link },
        ownersConnection: true,
        connectionLive: true,
        createEligible: true,
        typeSyncable: true,
        crmNow: crm(),
        ...over,
    });

describe('planPush (§8.5)', () => {
    it('stopped row → detach; other owner / deleted / Cancelled / unsyncable → cancel (or nothing without an event)', () => {
        assert.deepEqual(plan({ connectionLive: false }), { action: 'detach' });
        assert.deepEqual(plan({ ownersConnection: false }), { action: 'cancel' });
        assert.deepEqual(plan({}, {}, { isDeleted: true }), { action: 'cancel' });
        assert.deepEqual(plan({}, {}, { status: 'Cancelled' }), { action: 'cancel' });
        assert.deepEqual(plan({ typeSyncable: false }), { action: 'cancel' });
        assert.deepEqual(plan({}, { externalEventId: null, state: 'pending', base: null }, { isDeleted: true }), { action: 'noop', state: 'cancelled' });
    });

    it('create when there is no event and it is eligible; restore a cancelled one; removed_remote only on a new slot', () => {
        assert.deepEqual(plan({}, { externalEventId: null, base: null, state: 'pending' }), { action: 'create', restore: false, newGeneration: false });
        assert.deepEqual(plan({ createEligible: false }, { externalEventId: null, base: null, state: 'pending' }), { action: 'noop', state: 'cancelled' });
        assert.deepEqual(plan({}, { state: 'cancelled' }), { action: 'create', restore: true, newGeneration: false });
        assert.deepEqual(plan({}, { state: 'removed_remote' }), { action: 'noop', state: 'removed_remote' });
        const moved = crm({ when: { allDay: false, start: '2026-12-02T04:30:00.000Z', end: '2026-12-02T05:30:00.000Z' } });
        assert.deepEqual(plan({ crmNow: moved }, { state: 'removed_remote' }), { action: 'create', restore: false, newGeneration: true });
    });

    it('patch only changed groups; a Completed activity never moves its event; nothing changed → synced', () => {
        assert.deepEqual(plan({ crmNow: crm({ subject: 'Demo 2', location: 'Mumbai' }) }), { action: 'patch', groups: ['subject', 'location'] });
        const moved = crm({ subject: 'Done', when: { allDay: false, start: '2026-12-02T04:30:00.000Z', end: '2026-12-02T05:30:00.000Z' } });
        assert.deepEqual(plan({ crmNow: moved }, {}, { status: 'Completed' }), { action: 'patch', groups: ['subject'] });
        assert.deepEqual(plan(), { action: 'noop', state: 'synced' });
    });

    it('sendUpdates only when invitations are ours, there are guests, and they see the change', () => {
        assert.equal(shouldSendUpdates(['subject'], 'send', true), true);
        assert.equal(shouldSendUpdates(['subject'], 'withhold', true), false);
        assert.equal(shouldSendUpdates(['subject'], 'send', false), false);
        assert.equal(shouldSendUpdates(['reminder', 'description'], 'send', true), false);
    });
});

describe('planMerge (§8.7)', () => {
    const base: SyncBase = { crm: crm(), provider: provider() };
    const clock = { crmChangedAt: new Date('2026-11-26T06:00:00Z'), providerChangedAt: new Date('2026-11-26T07:00:00Z') };

    it('one side changed → that side; both changed differently → the later write wins; CRM-only changes stay pending', () => {
        const merged = planMerge(base, crm({ subject: 'CRM subject' }), provider({ location: 'ACME HQ', subject: 'Calendar subject' }), clock);
        assert.deepEqual(merged.apply, ['subject', 'location']);
        assert.deepEqual(merged.conflicts, ['subject']);
        assert.equal(merged.merged.subject, 'Calendar subject', 'the provider wrote later');
        const crmLater = planMerge(base, crm({ subject: 'CRM subject' }), provider({ subject: 'Calendar subject' }), { ...clock, providerChangedAt: new Date('2026-11-26T05:00:00Z') });
        assert.deepEqual(crmLater.apply, []);
        assert.deepEqual(crmLater.crmPending, ['subject']);
    });

    it('crmOnly groups (a follow-up activity’s slot) are never applied and are pushed back', () => {
        const moved = provider({ when: { allDay: false, start: '2026-12-03T04:30:00.000Z', end: '2026-12-03T05:30:00.000Z' } });
        const merged = planMerge(base, crm(), moved, clock, { crmOnly: ['when'] });
        assert.deepEqual(merged.apply, []);
        assert.deepEqual(merged.crmPending, ['when']);
        assert.equal(merged.base.crm.when.start, '2026-12-03T04:30:00.000Z', 'agreed = the calendar’s, so the CRM slot differs and is pushed');
    });

    it('attendees merge per address: added on either side kept, removed on either side dropped, replies from the provider', () => {
        const b: SyncBase = {
            crm: crm({ attendees: { 'a@x.com': { response: 'needsAction' }, 'b@x.com': { response: 'needsAction' } } }),
            provider: provider({ attendees: { 'a@x.com': { response: 'needsAction', optional: false, resource: false }, 'b@x.com': { response: 'needsAction', optional: false, resource: false } } }),
        };
        const crmNow = crm({ attendees: { 'a@x.com': { response: 'needsAction' }, 'b@x.com': { response: 'needsAction' }, 'c@x.com': { response: 'needsAction' } } });
        const providerNow = provider({ attendees: { 'a@x.com': { response: 'accepted', optional: false, resource: false }, 'd@x.com': { response: 'needsAction', optional: false, resource: false } } });
        const merged = planMerge(b, crmNow, providerNow, clock);
        assert.deepEqual(Object.keys(merged.merged.attendees), ['a@x.com', 'c@x.com', 'd@x.com']);
        assert.equal(merged.merged.attendees['a@x.com'].response, 'accepted');
        assert.ok(merged.crmPending.includes('attendees'), 'c@x.com still has to be invited');
    });
});

describe('push notifications (§4.7)', () => {
    const now = new Date('2026-11-26T06:00:00Z');

    it('calendar_sync_error / calendar_invites_held go to the owner, dedupe per activity, day and recipient', () => {
        const error = syncErrorNotification({ activityId: 'a1', owner: 'Palak', subject: 'Demo', provider: 'google', now });
        assert.equal(error.kind, 'calendar_sync_error');
        assert.equal(error.dedupeKey, 'calendar_sync_error:a1:2026-11-26:palak');
        assert.equal(error.entityModule, 'activities');
        const held = invitesHeldNotification({ activityId: 'a1', owner: 'palak', actor: 'asha', subject: 'Demo', guests: 2, newCopy: false }, 'Asha Rao', now);
        assert.equal(held.title, 'Asha Rao added 2 guests to Demo');
        assert.equal(held.dedupeKey, 'calendar_invites_held:a1:2026-11-26:palak');
    });

    it('integration_secret_expiring: one per admin and ISO week, opens Admin › API Integrations', () => {
        const rows = secretExpiringNotifications(['admin', 'Ravi'], { provider: 'microsoft', expiresOn: '2026-12-10', now });
        assert.deepEqual(
            rows.map((r) => r.dedupeKey),
            ['integration_secret_expiring:microsoft:2026-12-10:2026-W48:admin', 'integration_secret_expiring:microsoft:2026-12-10:2026-W48:ravi'],
        );
        assert.equal(rows[0].entityModule, 'admin-integrations');
        assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
        assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
        assert.equal(isoWeekKey('2026-11-30'), '2026-W49');
    });
});

describe('ActivityView.calendar (§14.5)', () => {
    const row = { assignedTo: 'palak', attendees: [{ kind: 'email', username: null, email: 'g@acme.com' }], externalUpdatedAt: null } as never;
    const link = blankLink({ activityId: 'a1', connectionId: 'c1', provider: 'google', requestedId: 'crm', invites: 'withhold', htmlLink: 'https://cal/x', lastErrorMessage: 'Bad', dirtyAt: new Date() });

    it('the owner sees the link, the error text and can send the withheld invitations; others see neither', () => {
        const owner = calendarViewOf(row, link, 'Palak', true);
        assert.equal(owner?.htmlLink, 'https://cal/x');
        assert.equal(owner?.errorMessage, 'Bad');
        assert.equal(owner?.canSendInvites, true);
        assert.equal(owner?.pending, true);
        const other = calendarViewOf(row, link, 'meena', false);
        assert.equal(other?.htmlLink, null);
        assert.equal(other?.errorMessage, null);
        assert.equal(other?.canSendInvites, false);
        assert.equal(calendarViewOf(row, undefined, 'palak', true), null);
    });
});

describe('lease (§8.4)', () => {
    it('one holder at a time; an expired lease can be taken; release only frees our own', async () => {
        const rows = [{ id: 'c1', leaseId: null as string | null, leaseUntil: null as Date | null }];
        const db = {
            calendarConnection: {
                updateMany: async ({ where, data }: { where: { id: string; leaseId?: string; OR?: { leaseUntil: null | { lt: Date } }[] }; data: { leaseId?: string | null; leaseUntil?: Date | null } }) => {
                    const row = rows.find((r) => r.id === where.id);
                    if (!row) return { count: 0 };
                    if (where.leaseId !== undefined && row.leaseId !== where.leaseId) return { count: 0 };
                    if (where.OR && !where.OR.some((w) => (w.leaseUntil === null ? row.leaseUntil === null : row.leaseUntil !== null && row.leaseUntil < w.leaseUntil.lt))) return { count: 0 };
                    Object.assign(row, data);
                    return { count: 1 };
                },
            },
        } as never;
        const t0 = new Date('2026-11-26T06:00:00Z');
        const first = await claimLease(db, 'c1', t0, 'L1');
        assert.ok(first);
        assert.equal(await claimLease(db, 'c1', t0, 'L2'), null);
        assert.equal(rows[0].leaseUntil?.getTime(), t0.getTime() + LEASE_TTL_MS);
        assert.equal(await first.keepAlive(new Date(t0.getTime() + 61_000)), true);
        const later = new Date(t0.getTime() + 61_000 + LEASE_TTL_MS + 1);
        const second = await claimLease(db, 'c1', later, 'L2');
        assert.ok(second, 'an expired lease is taken over');
        await first.release();
        assert.equal(rows[0].leaseId, 'L2', 'the old holder cannot release the new lease');
        await second.release();
        assert.equal(rows[0].leaseId, null);
    });
});

describe('scheduling helpers', () => {
    it('the background window is 07:00–22:00 business time', () => {
        assert.equal(isInsideSyncWindow(new Date('2026-11-26T01:29:00Z')), false); // 06:59 IST
        assert.equal(isInsideSyncWindow(new Date('2026-11-26T01:30:00Z')), true); // 07:00 IST
        assert.equal(isInsideSyncWindow(new Date('2026-11-26T16:29:00Z')), true); // 21:59 IST
        assert.equal(isInsideSyncWindow(new Date('2026-11-26T16:30:00Z')), false); // 22:00 IST
    });

    it('a busy lease or a rate limit moves the job back without an attempt; the last attempt is recognised', () => {
        assert.equal(pushRetryDelay({ status: 'busy' }, () => 0), 5_000);
        assert.equal(pushRetryDelay({ status: 'rate_limited', retryAfterMs: 30_000 }, () => 0), 30_000);
        assert.equal(pushRetryDelay({ status: 'clean' }), null);
        assert.equal(pushRetryDelay({ status: 'skipped', reason: 'connection_error' }), null);
        assert.equal(isLastAttempt({ attemptsMade: 5, opts: { attempts: 5 } }), true);
        assert.equal(isLastAttempt({ attemptsMade: 2, opts: { attempts: 5 } }), false);
    });
});
