import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { activityService } from '../activities/activity.service.js';
import { blankActivity, blankLink, EMPTY_CONFIGS, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { fakeAddEvent, fakeEditEvent, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import type { GoogleEventWire } from './providers/wire.js';
import { autoCompleteImported, classifyImport, inFlightMatch, MeetingImporter, selfReplyToApply, type ImportFacts, type InFlightMeeting } from './sync.import.js';
import { syncKeyOf } from './sync.keys.js';
import { pullConnection, resetPullStateForTests, type PullResult } from './sync.pull.js';
import { pushLink } from './sync.push.js';
import { normalizeGoogle, type ProviderEvent } from './sync.shapes.js';
import { runRsvp, setInlineRsvpForTests, type RsvpJobData } from './sync.rsvp.js';
import { setInlinePushForTests, startImportPulls } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * Customer meetings from the calendar (Calendar Phase 2 spec §13.1–§13.2, D17, D18; P2-8): the import rule table, the
 * pull bringing meetings in from the in-memory fake calendar, two employees invited to one meeting (one activity, two
 * links), the attendee view of a meeting organized outside the CRM, replies coming back, locks, removal from the CRM
 * and the nightly auto-complete.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'Asia/Kolkata';
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);
const rfc = (date: Date) => date.toISOString().replace('.000Z', 'Z');

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const ASHA: AuthUser = { id: 2, username: 'asha', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'asha', fullName: 'Asha Rao', isActive: true, email: 'asha@nandiniinfosys.com' },
];
const CONTACTS = [{ id: 'ct1', name: 'Ravi Kumar', organizationId: 'o1', isDeleted: false }];
const ORGS = [{ id: 'o1', organizationName: 'ACME Ltd', isDeleted: false }];
const EMAILS = [{ id: 'e1', email: 'ravi@acme.com', contactId: 'ct1', isPrimary: true, isInvalidBounce: false, sortOrder: 0 }];

const configs = (calendarSync: Record<string, unknown> = { allowMeetingImport: true }) =>
    ({ ...EMPTY_CONFIGS, moduleSettings: { activities: { calendarSync: { companyDomains: ['nandiniinfosys.com'], ...calendarSync } } } }) as unknown as FormConfigsPayload;

const conn = (over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), backfillCount: 0, ...over });
const ashaConn = (over: Partial<ConnectionRowState> = {}) => conn({ id: 'c2', username: 'asha', accountEmail: 'asha@nandiniinfosys.com', ...over });

let state: ActivityDoubleState;

function install(opts: { connections?: ConnectionRowState[]; importing?: string[]; calendarSync?: Record<string, unknown> } = {}) {
    state = installActivityDouble({
        users: USERS,
        contacts: CONTACTS,
        organizations: ORGS,
        entityEmails: EMAILS,
        connections: opts.connections ?? [conn(), ashaConn()],
        calendarSyncUsers: (opts.importing ?? ['palak', 'asha']).map((username) => ({ username, importMeetings: true })),
        configs: configs(opts.calendarSync),
    });
    return state;
}

/** A meeting in the fake calendar (Google wire shape). */
function calendarMeeting(id: string, over: Partial<GoogleEventWire> = {}): GoogleEventWire {
    const start = inDays(2);
    return {
        id,
        iCalUID: `${id}@fake.calendar`,
        summary: 'Quarterly review with ACME',
        location: 'ACME HQ',
        start: { dateTime: rfc(start), timeZone: TZ },
        end: { dateTime: rfc(new Date(start.getTime() + HOUR)), timeZone: TZ },
        organizer: { email: 'palak@nandiniinfosys.com' },
        attendees: [
            { email: 'ravi@acme.com', responseStatus: 'accepted' },
            { email: 'asha@nandiniinfosys.com', responseStatus: 'needsAction' },
        ],
        ...over,
    } as GoogleEventWire;
}

const done = (result: PullResult) => {
    assert.equal(result.status, 'done', JSON.stringify(result));
    return result as Extract<PullResult, { status: 'done' }>;
};
const imported = () => state.activities.filter((a) => a.origin === 'calendar');
const linksOf = (activityId: string) => state.links.filter((l) => l.activityId === activityId);
const attendeeOf = (activityId: string, username: string) => state.attendees.find((a) => a.activityId === activityId && a.kind === 'user' && a.username === username);

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    resetPullStateForTests();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    setInlinePushForTests(() => undefined);
});

afterEach(() => {
    restoreActivityDouble();
    setFakeProviderEnabledForTests(null);
    setInlinePushForTests(null);
});

// ── The rule ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('classifyImport (pure)', () => {
    const now = new Date('2026-11-26T06:00:00Z');
    const event = (over: Partial<ProviderEvent> = {}, when: Partial<ProviderEvent['shape']['when']> = {}): ProviderEvent => {
        const base = normalizeGoogle(
            {
                id: 'e1',
                iCalUID: 'e1@x',
                etag: '"1"',
                status: 'confirmed',
                summary: 'Review',
                start: { dateTime: '2026-11-28T10:00:00Z' },
                end: { dateTime: '2026-11-28T11:00:00Z' },
                organizer: { email: 'palak@nandiniinfosys.com' },
                attendees: [{ email: 'ravi@acme.com', responseStatus: 'accepted' }],
            } as GoogleEventWire,
            'palak@nandiniinfosys.com',
        );
        return { ...base, ...over, shape: { ...base.shape, ...(over.shape ?? {}), when: { ...base.shape.when, ...when } } };
    };
    const facts = (over: Partial<ImportFacts> = {}): ImportFacts => ({ enabled: true, now, username: 'palak', existing: null, hasContact: true, organizerUser: null, ...over });
    const reason = (e: ProviderEvent, f: ImportFacts) => {
        const d = classifyImport(e, f);
        return d.kind === 'ignore' ? d.reason : d.kind;
    };

    it('imports an organizer copy with a contact as the person’s own, two-way meeting', () => {
        assert.deepEqual(classifyImport(event(), facts()), { kind: 'import', role: 'organizer', assignedTo: 'palak', externalOrganizer: false });
    });

    it('needs both switches, a default event with an identity, and a contact', () => {
        assert.equal(reason(event(), facts({ enabled: false })), 'import_off');
        assert.equal(reason(event({ eventType: 'outOfOffice' }), facts()), 'event_type');
        assert.equal(reason(event({ iCalUid: '' }), facts()), 'no_identity');
        assert.equal(reason(event(), facts({ hasContact: false })), 'no_contact');
    });

    it('never: private, recurring, all-day, longer than 31 days, cancelled, declined, outside [now − 1 day, now + 180 days]', () => {
        assert.equal(reason(event({ isPrivate: true }), facts()), 'private');
        assert.equal(reason(event({ recurring: true }), facts()), 'recurring');
        assert.equal(reason(event({}, { allDay: true, start: '2026-11-28', end: '2026-11-29' }), facts()), 'all_day');
        assert.equal(reason(event({}, { start: '2026-11-28T10:00:00Z', end: '2027-01-10T10:00:00Z' }), facts()), 'too_long');
        assert.equal(reason(event({ status: 'cancelled' }), facts()), 'cancelled');
        assert.equal(reason(event({ isOrganizerCopy: false, selfResponse: 'declined' }), facts()), 'declined');
        assert.equal(reason(event({}, { start: '2026-11-24T10:00:00Z', end: '2026-11-24T11:00:00Z' }), facts()), 'outside_window');
        assert.equal(reason(event({}, { start: '2026-11-25T07:00:00Z', end: '2026-11-25T08:00:00Z' }), facts()), 'import', 'yesterday is still inside');
        assert.equal(reason(event({}, { start: '2027-06-01T10:00:00Z', end: '2027-06-01T11:00:00Z' }), facts()), 'outside_window');
    });

    it('a meeting the CRM holds: an invitation copy attends it (whatever its privacy); removed from the CRM = never again', () => {
        const existing = { id: 'a1', isDeleted: false, assignedTo: 'asha' };
        const invite = event({ isOrganizerCopy: false, isPrivate: true });
        assert.deepEqual(classifyImport(invite, facts({ existing })), { kind: 'attend', activityId: 'a1' });
        assert.equal(reason(invite, facts({ existing: { ...existing, isDeleted: true } })), 'removed_from_crm');
        assert.equal(reason(event(), facts({ existing })), 'already_in_crm');
        assert.equal(reason(invite, facts({ existing, enabled: false })), 'import_off');
    });

    it('invitation copies: organizer external → own + external; colleague without imports → theirs + external; with imports → theirs to bring in', () => {
        const invite = event({ isOrganizerCopy: false, organizerEmail: 'x@y.com' });
        assert.deepEqual(classifyImport(invite, facts()), { kind: 'import', role: 'attendee', assignedTo: 'palak', externalOrganizer: true });
        assert.deepEqual(classifyImport(invite, facts({ organizerUser: { username: 'asha', importsOwn: false } })), {
            kind: 'import',
            role: 'attendee',
            assignedTo: 'asha',
            externalOrganizer: true,
        });
        assert.equal(reason(invite, facts({ organizerUser: { username: 'asha', importsOwn: true } })), 'organizer_imports');
    });

    it('selfReplyToApply: three-way; a calendar needsAction never replaces a CRM answer', () => {
        assert.equal(selfReplyToApply('needsAction', 'accepted', 'needsAction'), 'accepted');
        assert.equal(selfReplyToApply('accepted', 'accepted', 'declined'), null, 'the calendar did not change: the CRM answer stays');
        assert.equal(selfReplyToApply('accepted', 'needsAction', 'accepted'), null);
        assert.equal(selfReplyToApply(null, 'declined', 'declined'), null);
        assert.equal(selfReplyToApply(null, 'tentative', 'accepted'), 'tentative');
    });

    it('inFlightMatch: a colleague’s CRM meeting still waiting for its event, by the Google event id (= requested id) or subject + exact time', () => {
        const meeting: InFlightMeeting = {
            id: 'a1',
            assignedTo: 'asha',
            requestedId: 'crm0123',
            startMs: Date.parse('2026-11-28T10:00:00Z'),
            endMs: Date.parse('2026-11-28T11:00:00Z'),
            subject: 'review',
        };
        assert.equal(inFlightMatch(event(), [meeting])?.id, 'a1', 'same subject (any case) and time');
        assert.equal(inFlightMatch(event({ id: 'crm0123', shape: { ...event().shape, subject: 'Renamed' } }), [meeting])?.id, 'a1', 'Google: the same event id');
        assert.equal(inFlightMatch(event({}, { start: '2026-11-28T10:30:00Z' }), [meeting]), null, 'another time');
        assert.equal(inFlightMatch(event(), []), null);
        assert.equal(inFlightMatch(event(), undefined), null);
    });
});

// ── The pull bringing meetings in ───────────────────────────────────────────────────────────────────────────────

describe('pull: customer meetings brought in', () => {
    it('an organizer copy with a contact becomes a two-way activity: origin calendar, the import type, the contact linked, nobody notified', async () => {
        install({ calendarSync: { allowMeetingImport: true, importFollowupType: 'Call' } });
        fakeAddEvent(calendarMeeting('m1'));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.imported, 1);
        const [row] = imported();
        assert.ok(row, 'imported');
        assert.equal(row.followupType, 'Call');
        assert.equal(row.assignedTo, 'palak');
        assert.equal(row.subject, 'Quarterly review with ACME');
        assert.equal(row.location, 'ACME HQ');
        assert.equal(row.status, 'Planned');
        assert.equal(row.reminder, null);
        assert.equal(row.contactId, 'ct1');
        assert.equal(row.organizationId, 'o1');
        assert.equal(row.createdBy, 'calendar-sync');
        assert.equal(row.externalOrganizer, false);
        assert.equal(row.syncKey, syncKeyOf('m1@fake.calendar'));
        assert.equal(row.organizerEmail, 'palak@nandiniinfosys.com');
        const people = state.attendees.filter((a) => a.activityId === row.id);
        assert.deepEqual(people.map((a) => a.kind).sort(), ['contact', 'user']);
        assert.equal(people.find((a) => a.kind === 'contact')?.responseStatus, 'accepted');
        const [link] = linksOf(row.id);
        assert.equal(link.role, 'organizer');
        assert.equal(link.state, 'synced');
        assert.equal(link.dirtyAt, null, 'nothing to push');
        assert.equal(link.externalEventId, 'm1');
        const audit = state.audits.find((a) => a.entityType === 'Activity' && a.action === 'CREATE');
        assert.equal(audit?.changedBy, 'palak');
        assert.equal(state.notifications.length, 0);

        // The next pull of the unchanged event is an echo.
        fakeEditEvent('m1', { summary: 'Quarterly review with ACME (room 2)' }, new Date(Date.now() + 60_000));
        const again = done(await pullConnection('c1', 'poll'));
        assert.equal(again.counts.applied, 1, 'later calendar edits merge through the organizer link');
        assert.equal(imported()[0].subject, 'Quarterly review with ACME (room 2)');
        assert.equal(imported().length, 1);
    });

    it('stays out: switches off, no contact, private, declined', async () => {
        install({ calendarSync: { allowMeetingImport: false } });
        fakeAddEvent(calendarMeeting('m1'));
        assert.equal(done(await pullConnection('c1', 'poll')).counts.skippedUnlinked, 1);
        restoreActivityDouble();

        install({ importing: ['asha'] });
        assert.equal(done(await pullConnection('c1', 'poll')).counts.skippedUnlinked, 1, 'the person’s own switch is off');
        restoreActivityDouble();

        resetFakeProvider();
        install();
        fakeAddEvent(calendarMeeting('m2', { attendees: [{ email: 'stranger@else.com', responseStatus: 'accepted' }] }));
        fakeAddEvent(calendarMeeting('m3', { visibility: 'private' } as Partial<GoogleEventWire>));
        fakeAddEvent(calendarMeeting('m4', { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'declined' }] }));
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.imported, 0);
        assert.equal(result.counts.skippedUnlinked, 3);
        assert.equal(imported().length, 0);
    });

    it('a customer’s meeting with two employees: one activity, two attendee links; the time follows the customer; each reply comes back', async () => {
        install();
        fakeAddEvent(
            calendarMeeting('m1', {
                organizer: { email: 'ravi@acme.com', displayName: 'Ravi Kumar' } as GoogleEventWire['organizer'],
                attendees: [
                    { email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'asha@nandiniinfosys.com', responseStatus: 'needsAction' },
                ],
            }),
        );
        assert.equal(done(await pullConnection('c1', 'poll')).counts.imported, 1);
        const [row] = imported();
        assert.equal(row.assignedTo, 'palak');
        assert.equal(row.externalOrganizer, true);
        assert.equal(row.organizerEmail, 'ravi@acme.com');
        assert.equal(row.contactId, 'ct1', 'the organizer is the contact');
        assert.equal(linksOf(row.id)[0].role, 'attendee');
        assert.ok(state.attendees.some((a) => a.activityId === row.id && a.kind === 'contact' && a.contactId === 'ct1'), 'the organizer is on the guest list');

        const second = done(await pullConnection('c2', 'poll'));
        assert.equal(second.counts.attended, 1);
        assert.equal(imported().length, 1, 'one activity');
        assert.deepEqual(linksOf(row.id).map((l) => [l.connectionId, l.role]).sort(), [['c1', 'attendee'], ['c2', 'attendee']]);
        assert.ok(attendeeOf(row.id, 'asha'), 'Asha is a colleague attendee');

        // The customer moves it; Asha accepts in her calendar.
        const moved = inDays(3);
        fakeEditEvent(
            'm1',
            {
                start: { dateTime: rfc(moved), timeZone: TZ },
                end: { dateTime: rfc(new Date(moved.getTime() + HOUR)), timeZone: TZ },
                attendees: [
                    { email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'asha@nandiniinfosys.com', responseStatus: 'accepted' },
                ],
            },
            new Date(Date.now() + 60_000),
        );
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].startAt?.getTime(), moved.getTime(), 'the designated link mirrors the new time');
        done(await pullConnection('c2', 'poll'));
        assert.equal(attendeeOf(row.id, 'asha')?.responseStatus, 'accepted');
        const rsvp = state.audits.find((a) => a.action === 'RSVP');
        assert.equal(rsvp?.changedBy, 'asha', 'her reply, audited as hers');

        // Palak declines her own meeting in the calendar: cancelled in the CRM; accepting again brings it back.
        fakeEditEvent('m1', { attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'declined' }, { email: 'asha@nandiniinfosys.com', responseStatus: 'accepted' }] });
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].status, 'Cancelled');
        fakeEditEvent('m1', { attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }, { email: 'asha@nandiniinfosys.com', responseStatus: 'accepted' }] });
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].status, 'Planned');
    });

    it('locks: title, time, place, attendees and owner of an outside meeting are changed in the calendar; remarks stay editable', async () => {
        install();
        fakeAddEvent(calendarMeeting('m1', { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }] }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        const view = await activityService.getById(row.id, PALAK);
        assert.deepEqual(view.lockedFields, ['subject', 'startAt', 'endAt', 'allDay', 'location', 'attendees', 'assignedTo']);
        assert.equal(view.importedFrom, 'fake');
        assert.equal(view.organizerEmail, 'ravi@acme.com');
        await assert.rejects(
            activityService.update(row.id, { ...view, subject: 'Renamed' }, PALAK),
            (err: unknown) => err instanceof HttpError && err.statusCode === 409 && err.code === 'EXTERNAL_EVENT_LOCKED',
        );
        const saved = await activityService.update(row.id, { ...view, remarks: 'Bring the price list' }, PALAK);
        assert.equal(saved.remarks, 'Bring the price list');
        assert.equal(linksOf(row.id)[0].dirtyAt, null, 'never pushed');
        assert.equal(state.links.filter((l) => l.role === 'organizer').length, 0, 'no copy of it is made in the calendar');
    });

    it('a colleague organizer without imports: theirs and external until they connect; their pull then makes it theirs (relink upgrade)', async () => {
        install({ connections: [conn()] });
        fakeAddEvent(calendarMeeting('m1', { organizer: { email: 'asha@nandiniinfosys.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'tentative' }, { email: 'ravi@acme.com', responseStatus: 'accepted' }] }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        assert.equal(row.assignedTo, 'asha');
        assert.equal(row.externalOrganizer, true);
        assert.equal(attendeeOf(row.id, 'palak')?.responseStatus, 'tentative', 'Palak’s own reply');

        state.connections.push(ashaConn());
        const result = done(await pullConnection('c2', 'poll'));
        assert.equal(result.counts.relinked, 1);
        assert.equal(imported()[0].externalOrganizer, false, 'upgraded');
        assert.equal(linksOf(row.id).find((l) => l.connectionId === 'c2')?.role, 'organizer');
        assert.ok(state.audits.some((a) => a.action === 'UPDATE' && JSON.stringify(a.changes).includes('externalOrganizer')), 'the upgrade is audited');
    });

    it('removed from the CRM: the calendar event stays, the link stops, and the meeting is never brought in again', async () => {
        install();
        fakeAddEvent(calendarMeeting('m1'));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        await activityService.remove(row.id, PALAK);
        const link = linksOf(row.id)[0];
        assert.ok(link.dirtyAt, 'the delete is sent through the push');
        await pushLink(link.id);
        assert.equal(linksOf(row.id)[0].state, 'detached');
        assert.equal(fakeProviderState.events.get('m1')?.status, 'confirmed', 'never deleted in the calendar');
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'cancel').length, 0);

        fakeEditEvent('m1', { summary: 'Still there' });
        const again = done(await pullConnection('c1', 'poll', { full: true }));
        assert.equal(again.counts.imported, 0);
        assert.equal(state.activities.length, 1);
    });

    it('a concurrent import that won (D45): the pre-read finds the syncKey holder and attends it instead', async () => {
        install();
        const wire = calendarMeeting('m1', { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }] });
        fakeAddEvent(wire);
        const event = normalizeGoogle(fakeProviderState.events.get('m1') as GoogleEventWire, 'palak@nandiniinfosys.com');
        const { loadCalendarSettings } = await import('../integrations/integration.settings.js');
        const { loadActivityConfig } = await import('../activities/activity.service.js');
        const importer = new MeetingImporter(state.connections[0] as never, await loadCalendarSettings(), await loadActivityConfig(), () => new Date());
        await importer.init();
        await importer.preparePage([event]);
        // Another pull inserted it meanwhile.
        const start = new Date(Date.parse(event.shape.when.start));
        state.activities.push(
            blankActivity({
                id: 'winner',
                subject: 'Quarterly review with ACME',
                assignedTo: 'asha',
                createdBy: 'calendar-sync',
                origin: 'calendar',
                syncKey: syncKeyOf(event.iCalUid),
                externalOrganizer: true,
                startAt: start,
                endAt: new Date(start.getTime() + HOUR),
            }),
        );
        const outcome = await importer.applyUnlinked(event);
        assert.equal(outcome.outcome, 'attended');
        assert.equal(imported().length, 1);
        assert.equal(linksOf('winner')[0].role, 'attendee');
        assert.ok(attendeeOf('winner', 'palak'));
    });
    it('a gone copy of a CRM-held meeting the person owns changes nothing: its organizer link decides (a reassigned, overdue meeting stays Planned)', async () => {
        install();
        const start = inDays(2);
        state.activities.push(
            blankActivity({
                id: 'held',
                subject: 'Quarterly review with ACME',
                assignedTo: 'palak',
                createdBy: 'palak',
                origin: 'crm',
                status: 'Planned',
                iCalUid: 'm1@fake.calendar',
                syncKey: syncKeyOf('m1@fake.calendar'),
                startAt: start,
                endAt: new Date(start.getTime() + HOUR),
            }),
        );
        fakeAddEvent(calendarMeeting('m1', { start: { dateTime: rfc(start), timeZone: TZ }, end: { dateTime: rfc(new Date(start.getTime() + HOUR)), timeZone: TZ } }));
        assert.equal(done(await pullConnection('c2', 'poll')).counts.attended, 1);
        // Handed to Asha; Palak's old event is cancelled, so Asha's invitation copy goes.
        Object.assign(state.activities.find((a) => a.id === 'held') as object, { assignedTo: 'asha' });
        fakeEditEvent('m1', { status: 'cancelled' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c2', 'poll'));
        assert.equal(state.activities.find((a) => a.id === 'held')?.status, 'Planned', 'not cancelled by a copy');
        assert.equal(linksOf('held').find((l) => l.connectionId === 'c2')?.state, 'cancelled');
        assert.equal(state.notifications.length, 0);
    });

    it('this person’s own organizer copy of an activity a colleague’s pull brought in meanwhile is relinked, never attended (D45)', async () => {
        install();
        fakeAddEvent(calendarMeeting('m1'));
        const event = normalizeGoogle(fakeProviderState.events.get('m1') as GoogleEventWire, 'palak@nandiniinfosys.com');
        assert.equal(event.isOrganizerCopy, true);
        const { loadCalendarSettings } = await import('../integrations/integration.settings.js');
        const { loadActivityConfig } = await import('../activities/activity.service.js');
        const importer = new MeetingImporter(state.connections[0] as never, await loadCalendarSettings(), await loadActivityConfig(), () => new Date());
        await importer.init();
        await importer.preparePage([event]);
        const start = new Date(Date.parse(event.shape.when.start));
        const holder = (id: string, assignedTo: string) =>
            blankActivity({
                id,
                subject: 'Quarterly review with ACME',
                assignedTo,
                createdBy: 'calendar-sync',
                origin: 'calendar',
                syncKey: syncKeyOf(event.iCalUid),
                externalOrganizer: true,
                startAt: start,
                endAt: new Date(start.getTime() + HOUR),
            });
        state.activities.push(holder('theirs', 'palak'));
        const outcome = await importer.applyUnlinked(event);
        assert.equal(outcome.relinkActivityId, 'theirs', 'the pull relinks it (§8.2)');
        assert.equal(linksOf('theirs').length, 0, 'no attendee link on an organizer copy');

        state.activities.splice(0, state.activities.length, holder('other', 'asha'));
        const other = await importer.applyUnlinked(event);
        assert.equal(other.outcome, 'ignored');
        assert.equal(other.relinkActivityId, undefined);
        assert.equal(linksOf('other').length, 0);
    });

    it('an invitation copy of a colleague’s CRM meeting whose push has not stored its identity yet attends it (no locked duplicate)', async () => {
        install({ importing: ['palak'] });
        const start = inDays(2);
        state.activities.push(
            blankActivity({ id: 'crm1', subject: 'Quarterly review with ACME', assignedTo: 'asha', createdBy: 'asha', origin: 'crm', status: 'Planned', startAt: start, endAt: new Date(start.getTime() + HOUR) }),
        );
        // Asha's push created the event, but its store failed: the link has no event id yet and waits for a retry.
        state.links.push(blankLink({ id: 'l-crm1', activityId: 'crm1', connectionId: 'c2', provider: 'fake', requestedId: 'crmffff', role: 'organizer', state: 'error', dirtyAt: new Date() }));
        fakeAddEvent(
            calendarMeeting('m1', {
                organizer: { email: 'asha@nandiniinfosys.com' },
                start: { dateTime: rfc(start), timeZone: TZ },
                end: { dateTime: rfc(new Date(start.getTime() + HOUR)), timeZone: TZ },
                attendees: [
                    { email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'ravi@acme.com', responseStatus: 'accepted' },
                ],
            }),
        );
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.imported, 0);
        assert.equal(result.counts.attended, 1);
        assert.equal(imported().length, 0, 'no second activity');
        assert.equal(linksOf('crm1').find((l) => l.connectionId === 'c1')?.role, 'attendee');
        assert.equal(attendeeOf('crm1', 'palak')?.responseStatus, 'accepted');
    });

    it('turning import on brings in meetings already in the calendar: one full pull (incremental pulls never list them)', async () => {
        install({ importing: [] });
        fakeAddEvent(calendarMeeting('m1'));
        done(await pullConnection('c1', 'poll'));
        assert.ok(state.connections[0].syncCursor, 'a cursor from the first pull');
        state.calendarSyncUsers.push({ username: 'palak', provider: null, excluded: false, note: null, importMeetings: true } as (typeof state.calendarSyncUsers)[number]);
        assert.equal(done(await pullConnection('c1', 'poll')).counts.imported, 0, 'the meeting did not change, so an incremental pull never sees it');

        assert.equal(await startImportPulls(['palak']), 1);
        assert.equal(state.connections[0].syncCursor, null);
        const full = done(await pullConnection('c1', 'poll'));
        assert.equal(full.full, true);
        assert.equal(full.counts.imported, 1);
        assert.equal(await startImportPulls(['asha']), 0, 'nothing for someone whose calendar has no cursor yet');
    });

    it('the owner of a customer’s meeting replies in the CRM: Decline cancels it and reaches their copy; Maybe brings it back', async () => {
        install();
        const queued: RsvpJobData[] = [];
        setInlineRsvpForTests((data) => queued.push(data));
        try {
            fakeAddEvent(calendarMeeting('m1', { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'needsAction' }] }));
            done(await pullConnection('c1', 'poll'));
            const [row] = imported();
            assert.equal(row.externalOrganizer, true);
            assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, 'needsAction', 'Palak can answer her own invitation');

            const declined = await activityService.respond(row.id, { responseStatus: 'declined' }, PALAK);
            assert.equal(declined.status, 'Cancelled');
            assert.equal(declined.viewer.myResponse, 'declined');
            assert.deepEqual(queued, [{ activityId: row.id, username: 'palak' }]);
            assert.ok(state.audits.some((a) => a.action === 'RSVP' && a.changedBy === 'palak'));
            const palakInCalendar = () => fakeProviderState.events.get('m1')?.attendees?.find((a) => a.email === 'palak@nandiniinfosys.com')?.responseStatus;

            // A pull before the reply is sent keeps the CRM answer (the calendar's needsAction never replaces it).
            done(await pullConnection('c1', 'poll', { full: true }));
            assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, 'declined');

            assert.deepEqual(await runRsvp(row.id, 'palak'), { status: 'done', reply: 'declined' });
            assert.equal(palakInCalendar(), 'declined', 'the customer sees the decline');
            done(await pullConnection('c1', 'poll'));
            assert.equal(imported()[0].status, 'Cancelled');

            const maybe = await activityService.respond(row.id, { responseStatus: 'tentative' }, PALAK);
            assert.equal(maybe.status, 'Planned');
            assert.equal(maybe.viewer.myResponse, 'tentative');
            assert.equal((await runRsvp(row.id, 'palak')).status, 'done');
            assert.equal(palakInCalendar(), 'tentative');
            await assert.rejects(activityService.respond(row.id, { responseStatus: 'accepted' }, ASHA), (err: unknown) => err instanceof HttpError && err.statusCode === 403);
        } finally {
            setInlineRsvpForTests(null);
        }
    });
});

describe('nightly auto-complete of imported meetings', () => {
    it('completes imported, unfiled, Planned meetings that ended before today; leaves the rest', async () => {
        install();
        const ended = new Date(Date.now() - 3 * DAY);
        const base = { subject: 'Met ACME', assignedTo: 'palak', createdBy: 'calendar-sync', status: 'Planned', startAt: ended, endAt: new Date(ended.getTime() + HOUR) };
        state.activities.push(
            blankActivity({ id: 'old', origin: 'calendar', ...base }),
            blankActivity({ id: 'filed', origin: 'calendar', relatedModule: 'leads', relatedId: 'l1', ...base }),
            blankActivity({ id: 'crm', origin: 'crm', ...base }),
            blankActivity({ id: 'later', origin: 'calendar', ...base, startAt: inDays(1), endAt: new Date(inDays(1).getTime() + HOUR) }),
        );
        const completed = await autoCompleteImported(new Date());
        assert.equal(completed, 1);
        const status = (id: string) => state.activities.find((a) => a.id === id)?.status;
        assert.equal(status('old'), 'Completed');
        assert.equal(state.activities.find((a) => a.id === 'old')?.completedBy, 'calendar-sync');
        assert.equal(status('filed'), 'Planned');
        assert.equal(status('crm'), 'Planned');
        assert.equal(status('later'), 'Planned');
        void ASHA;
    });
});
