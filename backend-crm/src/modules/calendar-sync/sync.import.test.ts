import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { activityService } from '../activities/activity.service.js';
import { blankActivity, blankLink, EMPTY_CONFIGS, installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { fakeAddEvent, fakeDeleteEvent, fakeEditEvent, fakeMeetUrl, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { ProviderTransientError, resetProviderPauses } from './providers/http.js';
import { getAdapter, setAdapterForTests, setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import type { GoogleEventWire } from './providers/wire.js';
import { autoCompleteImported, classifyImport, inFlightMatch, MeetingImporter, selfReplyToApply, type ImportFacts, type InFlightMeeting } from './sync.import.js';
import { eventKeyOf, syncKeyOf } from './sync.keys.js';
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
        assert.deepEqual(view.lockedFields, ['subject', 'startAt', 'endAt', 'allDay', 'location', 'attendees', 'assignedTo', 'videoMeeting']);
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

    it('video meeting of an outside meeting (P3-1): the organizer’s join link shows read only; the CRM can’t add, change or remove one', async () => {
        install();
        const meet = (id: string) => ({
            hangoutLink: fakeMeetUrl(id),
            conferenceData: { conferenceId: id, conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: fakeMeetUrl(id) }] },
        });
        fakeAddEvent(calendarMeeting('m1', { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }], ...meet('aaa-bbbb-ccc') }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        assert.equal(row.externalOrganizer, true);
        const view = await activityService.getById(row.id, PALAK);
        assert.equal(view.videoMeeting, 'meet');
        assert.equal(view.conferenceJoinUrl, fakeMeetUrl('aaa-bbbb-ccc'));
        assert.equal(view.conference?.state, 'ready');
        assert.equal(view.conference?.canRetry, false);
        assert.ok(view.lockedFields.includes('videoMeeting'));
        const locked = (err: unknown) => err instanceof HttpError && err.statusCode === 409 && err.code === 'EXTERNAL_EVENT_LOCKED';
        await assert.rejects(activityService.update(row.id, { videoMeeting: null }, PALAK), locked);
        await assert.rejects(activityService.update(row.id, { videoMeeting: 'teams' }, PALAK), locked);
        // Sending the stored value back (the form does) is fine.
        const saved = await activityService.update(row.id, { ...view, remarks: 'Agenda sent' }, PALAK);
        assert.equal(saved.conferenceJoinUrl, fakeMeetUrl('aaa-bbbb-ccc'));
        assert.equal(linksOf(row.id)[0].dirtyAt, null, 'never pushed');

        // The organizer changes the link, then removes it: the designated link mirrors both (no audit entry, no push).
        const audits = state.audits.length;
        fakeEditEvent('m1', meet('ddd-eeee-fff'), new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].conferenceJoinUrl, fakeMeetUrl('ddd-eeee-fff'));
        fakeEditEvent('m1', { hangoutLink: null, conferenceData: null } as Partial<GoogleEventWire>, new Date(Date.now() + 120_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].conferenceProvider, null);
        assert.equal(imported()[0].conferenceJoinUrl, null);
        assert.equal(state.audits.length, audits);
        assert.equal(linksOf(row.id)[0].dirtyAt, null, 'still never pushed');
    });

    it('a meeting created in the CRM (not locked) still takes a video meeting change', async () => {
        install();
        const created = await activityService.create(
            { followupType: 'Meeting', subject: 'In-house demo', assignedTo: 'palak', startAt: inDays(3).toISOString(), endAt: new Date(inDays(3).getTime() + HOUR).toISOString() },
            PALAK,
        );
        assert.equal(created.lockedFields.includes('videoMeeting'), false);
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

describe('customer meetings: second review fixes', () => {
    const ADMIN: AuthUser = { id: 9, username: 'admin', role: 'admin' };
    const locked = (field: string) => (err: unknown) =>
        err instanceof HttpError && err.statusCode === 409 && err.code === 'EXTERNAL_EVENT_LOCKED' && JSON.stringify(err.errors ?? []).includes(field);
    const meet = (id: string) => ({
        hangoutLink: fakeMeetUrl(id),
        conferenceData: { conferenceId: id, conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: fakeMeetUrl(id) }] },
    });
    const customerMeeting = (id: string, over: Partial<GoogleEventWire> = {}) =>
        calendarMeeting(id, { organizer: { email: 'ravi@acme.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }], ...over });

    it('an outside meeting can’t become a Task or Note (409 on followupType); another type is fine; no join link is mirrored onto a Task', async () => {
        install();
        fakeAddEvent(customerMeeting('m1', meet('aaa-bbbb-ccc')));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        const view = await activityService.getById(row.id, PALAK);
        await assert.rejects(activityService.update(row.id, { ...view, followupType: 'Task' }, PALAK), locked('followupType'));
        await assert.rejects(activityService.update(row.id, { ...view, followupType: 'Note', remarks: 'Call notes' }, PALAK), locked('followupType'));
        const after = imported()[0];
        assert.equal(after.followupType, view.followupType);
        assert.equal(after.conferenceJoinUrl, fakeMeetUrl('aaa-bbbb-ccc'), 'nothing was dropped');
        assert.ok(after.endAt && after.location, 'times and place kept');
        assert.equal((await activityService.update(row.id, { ...view, followupType: 'Call' }, PALAK)).followupType, 'Call');

        // A Task stored before this guard: the mirror never puts a Join link on it.
        Object.assign(imported()[0], { followupType: 'Task', conferenceProvider: null, conferenceState: null, conferenceJoinUrl: null, conferenceId: null });
        fakeEditEvent('m1', { summary: 'Quarterly review (moved room)', ...meet('ddd-eeee-fff') }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].subject, 'Quarterly review (moved room)');
        assert.equal(imported()[0].conferenceProvider, null);
        assert.equal(imported()[0].conferenceJoinUrl, null);
    });

    it('the person’s own meeting brings its Meet link along at import (adopted: the push neither asks for nor removes one, and never touches the agenda)', async () => {
        install();
        fakeAddEvent(calendarMeeting('m1', { ...meet('own-meet-xyz'), description: 'Agenda: pricing, rollout dates' }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        assert.equal(row.externalOrganizer, false);
        assert.equal(row.conferenceProvider, 'meet');
        assert.equal(row.conferenceState, 'ready');
        assert.equal(row.conferenceJoinUrl, fakeMeetUrl('own-meet-xyz'));
        const [link] = linksOf(row.id);
        assert.equal(JSON.parse(link.baseJson as string).crm.conference?.provider, 'meet', 'the base records the adopted link');
        assert.equal(link.dirtyAt, null, 'no join-details push: the description is the person’s own');
        assert.equal(link.state, 'synced');
        const view = await activityService.getById(row.id, PALAK);
        assert.equal(view.videoMeeting, 'meet');

        // A later CRM change goes out without the description (a patch would replace the whole agenda).
        await activityService.update(row.id, { ...view, location: 'Room 2' }, PALAK);
        await pushLink(link.id);
        const patches = fakeProviderState.eventCalls.filter((c) => c.op === 'patch');
        assert.equal(patches.length, 1);
        assert.ok(!('description' in (patches[0].body ?? {})), JSON.stringify(patches[0].body));
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'create').length, 0, 'no new event');
        const event = fakeProviderState.events.get('m1');
        assert.equal(event?.location, 'Room 2');
        assert.equal(event?.description, 'Agenda: pricing, rollout dates', 'the agenda stays');
        assert.equal(imported()[0].conferenceJoinUrl, fakeMeetUrl('own-meet-xyz'), 'the link stays');
        assert.equal(event?.hangoutLink, fakeMeetUrl('own-meet-xyz'), 'never removed from the event');
    });

    it('a Meet link added later to the person’s imported meeting is taken over without a push over its agenda', async () => {
        install();
        fakeAddEvent(calendarMeeting('m1', { description: 'Agenda: pricing' }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        fakeEditEvent('m1', meet('later-meet'), new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].conferenceJoinUrl, fakeMeetUrl('later-meet'));
        const [link] = linksOf(row.id);
        assert.equal(link.dirtyAt, null, 'nothing to push');
        await pushLink(link.id);
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'patch').length, 0);
        assert.equal(fakeProviderState.events.get('m1')?.description, 'Agenda: pricing');
    });

    it('a cancelled copy can’t be answered: no reply buttons, 403, and the meeting stays Cancelled', async () => {
        install();
        setInlineRsvpForTests(() => undefined);
        try {
            fakeAddEvent(customerMeeting('m1'));
            done(await pullConnection('c1', 'poll'));
            const [row] = imported();
            fakeEditEvent('m1', { status: 'cancelled' }, new Date(Date.now() + 60_000));
            done(await pullConnection('c1', 'poll'));
            assert.equal(imported()[0].status, 'Cancelled');
            assert.equal(linksOf(row.id)[0].state, 'cancelled');
            assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, null, 'nothing to answer');
            await assert.rejects(activityService.respond(row.id, { responseStatus: 'accepted' }, PALAK), (err: unknown) => err instanceof HttpError && err.statusCode === 403);
            assert.equal(imported()[0].status, 'Cancelled', 'not brought back');
        } finally {
            setInlineRsvpForTests(null);
        }
    });

    it('the rsvp job keeps an owner’s newer reply saved while its call was in flight (and the next job sends it)', async () => {
        install();
        setInlineRsvpForTests(() => undefined);
        const real = getAdapter('fake');
        try {
            fakeAddEvent(customerMeeting('m1', { attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'needsAction' }] }));
            done(await pullConnection('c1', 'poll'));
            const [row] = imported();
            await activityService.respond(row.id, { responseStatus: 'declined' }, PALAK);
            let raced = false;
            setAdapterForTests('fake', {
                ...real,
                respond: async (ctx, id, reply) => {
                    if (!raced) {
                        raced = true;
                        // Palak changes her mind while the decline is on its way.
                        await activityService.respond(row.id, { responseStatus: 'accepted' }, PALAK);
                    }
                    return (real.respond as NonNullable<typeof real.respond>)(ctx, id, reply);
                },
            });
            assert.deepEqual(await runRsvp(row.id, 'palak'), { status: 'done', reply: 'declined' });
            assert.equal(imported()[0].status, 'Planned');
            assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, 'accepted', 'the newer reply is kept');
            assert.deepEqual(await runRsvp(row.id, 'palak'), { status: 'done', reply: 'accepted' });
            assert.equal(fakeProviderState.events.get('m1')?.attendees?.find((a) => a.email === 'palak@nandiniinfosys.com')?.responseStatus, 'accepted');
        } finally {
            setAdapterForTests('fake', null);
            setInlineRsvpForTests(null);
        }
    });

    it('a colleague’s meeting nobody else follows: its last copy cancelled cancels it (never auto-completed); the copy coming back brings it back', async () => {
        install({ connections: [conn()] });
        fakeAddEvent(calendarMeeting('m1', { organizer: { email: 'asha@nandiniinfosys.com' }, attendees: [{ email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' }, { email: 'ravi@acme.com', responseStatus: 'accepted' }] }));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        assert.equal(row.assignedTo, 'asha');
        fakeEditEvent('m1', { status: 'cancelled' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].status, 'Cancelled', 'Asha cancelled it');
        assert.equal(attendeeOf(row.id, 'palak')?.responseStatus, 'declined');
        assert.equal(await autoCompleteImported(new Date(Date.now() + 10 * DAY)), 0, 'never completed');

        fakeEditEvent('m1', { status: 'confirmed' }, new Date(Date.now() + 120_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].status, 'Planned', 'put back');
    });

    it('a copy cancelled while another colleague still holds one is only that colleague’s decline', async () => {
        install({ connections: [conn(), ashaConn()], importing: ['palak'] });
        state.users.push({ username: 'sam', fullName: 'Sam Iyer', isActive: true, email: 'sam@nandiniinfosys.com' } as (typeof state.users)[number]);
        fakeAddEvent(
            calendarMeeting('m1', {
                organizer: { email: 'sam@nandiniinfosys.com' },
                attendees: [
                    { email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'asha@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'ravi@acme.com', responseStatus: 'accepted' },
                ],
            }),
        );
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        assert.equal(row.assignedTo, 'sam');
        state.links.push(blankLink({ id: 'l-asha', activityId: row.id, connectionId: 'c2', provider: 'fake', requestedId: 'x', role: 'attendee', state: 'synced', externalEventId: 'other-copy' }));
        fakeEditEvent('m1', { status: 'cancelled' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(imported()[0].status, 'Planned', 'Asha’s copy still follows it');
        assert.equal(attendeeOf(row.id, 'palak')?.responseStatus, 'declined');
    });

    it('restoring a removed outside meeting re-attaches its copies; the next pull reads them back: the organizer’s changes reach it again', async () => {
        install();
        fakeAddEvent(customerMeeting('m1'));
        done(await pullConnection('c1', 'poll'));
        const [row] = imported();
        await activityService.remove(row.id, PALAK);
        fakeEditEvent('m1', { summary: 'Moved while removed' }, new Date(Date.now() + 60_000));
        done(await pullConnection('c1', 'poll'));
        assert.equal(linksOf(row.id)[0].state, 'detached');

        const cursor = state.connections[0].syncCursor;
        await activityService.restore(row.id, ADMIN);
        const link = linksOf(row.id)[0];
        assert.equal(link.state, 'synced');
        assert.equal(link.etag, null);
        assert.equal(state.connections[0].syncCursor, cursor, 'no full pull needed: the copy is read back directly');
        const next = done(await pullConnection('c1', 'poll'));
        assert.equal(next.full, false);
        assert.equal(next.counts.verified, 1);
        assert.equal(imported()[0].subject, 'Moved while removed');
        assert.ok(linksOf(row.id)[0].etag, 'read once: the etag is stored');
        assert.equal(done(await pullConnection('c1', 'poll')).counts.verified, 0, 'not read again');
        assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, 'accepted', 'the owner can answer again');
    });

    for (const [how, purge] of [
        ['cancelled', false],
        ['deleted for good (the read back finds nothing)', true],
    ] as const) {
        it(`restoring a removed outside meeting whose copy was ${how} meanwhile brings it back Cancelled (never auto-completed, no reply buttons)`, async () => {
            install();
            fakeAddEvent(customerMeeting('m1'));
            done(await pullConnection('c1', 'poll'));
            const [row] = imported();
            await activityService.remove(row.id, PALAK);
            fakeDeleteEvent('m1', new Date(Date.now() + 60_000));
            done(await pullConnection('c1', 'poll'));
            assert.equal(linksOf(row.id)[0].state, 'detached', 'the pull that saw the cancel only detached the copy');
            if (purge) fakeProviderState.events.delete('m1');

            await activityService.restore(row.id, ADMIN);
            assert.equal(imported()[0].status, 'Planned');
            // A full listing never shows a gone event; the read back does.
            state.connections[0].syncCursor = null;
            done(await pullConnection('c1', 'poll'));
            assert.equal(imported()[0].status, 'Cancelled');
            assert.equal(linksOf(row.id)[0].state, 'cancelled');
            assert.equal((await activityService.getById(row.id, PALAK)).viewer.myResponse, null, 'nothing to answer');
            assert.equal(await autoCompleteImported(new Date(Date.now() + 10 * DAY)), 0, 'never completed');
        });
    }

    it('restoring a CRM-made meeting re-attaches a colleague’s invitation copy too (not only imported ones)', async () => {
        install({ importing: ['palak'] });
        const start = inDays(2);
        state.activities.push(
            blankActivity({ id: 'crm1', subject: 'Quarterly review with ACME', assignedTo: 'asha', createdBy: 'asha', origin: 'crm', status: 'Planned', startAt: start, endAt: new Date(start.getTime() + HOUR) }),
        );
        state.links.push(blankLink({ id: 'l-asha', activityId: 'crm1', connectionId: 'c2', provider: 'fake', requestedId: 'crmffff', role: 'organizer', state: 'detached' }));
        state.links.push(
            blankLink({ id: 'l-palak', activityId: 'crm1', connectionId: 'c1', provider: 'fake', requestedId: 'x', role: 'attendee', state: 'detached', externalEventId: 'm1', externalEventKey: 'm1', etag: '"old"' }),
        );
        state.activities.find((a) => a.id === 'crm1')!.isDeleted = true;
        await activityService.restore('crm1', ADMIN);
        const copy = state.links.find((l) => l.id === 'l-palak');
        assert.equal(copy?.state, 'synced');
        assert.equal(copy?.etag, null);
    });

    it('a re-attached copy whose read back fails holds the cursor when its replacement is listed: the replay moves the link to the new copy', async () => {
        install({ importing: ['palak'] });
        done(await pullConnection('c1', 'poll'));
        const cursor = state.connections[0].syncCursor;
        assert.ok(cursor, 'a cursor from the first pull');
        const start = inDays(2);
        // Restored on Microsoft (no undelete): Asha's push made the meeting again, so Palak has a new copy with a new id;
        // her old link was re-attached (synced, no etag) and still points at the old, gone copy.
        state.activities.push(
            blankActivity({
                id: 'crm1',
                subject: 'Quarterly review with ACME',
                assignedTo: 'asha',
                createdBy: 'asha',
                origin: 'crm',
                status: 'Planned',
                iCalUid: 'm-new@fake.calendar',
                syncKey: syncKeyOf('m-new@fake.calendar'),
                startAt: start,
                endAt: new Date(start.getTime() + HOUR),
            }),
        );
        state.links.push(
            blankLink({ id: 'l-palak', activityId: 'crm1', connectionId: 'c1', provider: 'fake', requestedId: 'x', role: 'attendee', state: 'synced', externalEventId: 'm-old', externalEventKey: eventKeyOf('m-old'), etag: null }),
        );
        fakeAddEvent(
            calendarMeeting('m-new', {
                organizer: { email: 'asha@nandiniinfosys.com' },
                start: { dateTime: rfc(start), timeZone: TZ },
                end: { dateTime: rfc(new Date(start.getTime() + HOUR)), timeZone: TZ },
                attendees: [
                    { email: 'palak@nandiniinfosys.com', responseStatus: 'accepted' },
                    { email: 'ravi@acme.com', responseStatus: 'accepted' },
                ],
            }),
        );
        fakeProviderState.failNext.get = new ProviderTransientError({ provider: 'fake', operation: 'get-event', status: 503, code: 'backendError' });

        const first = done(await pullConnection('c1', 'poll'));
        assert.equal(first.counts.verified, 1);
        assert.equal(first.counts.attended, 0);
        assert.equal(first.counts.failed, 1, 'the replacement copy is held, not ignored');
        assert.equal(state.connections[0].syncCursor, cursor, 'the cursor is held');
        const held = state.links.find((l) => l.id === 'l-palak');
        assert.equal(held?.externalEventId, 'm-old');
        assert.equal(held?.state, 'synced');

        const second = done(await pullConnection('c1', 'poll'));
        assert.equal(second.counts.failed, 0);
        assert.equal(second.counts.attended, 1, 'the replay hands the new copy to the attend path');
        const moved = state.links.find((l) => l.id === 'l-palak');
        assert.equal(moved?.externalEventId, 'm-new');
        assert.equal(moved?.state, 'synced');
        assert.ok(moved?.etag, 'read: the etag is stored');
        assert.equal(linksOf('crm1').length, 1, 'still one link for Palak');
        assert.equal(attendeeOf('crm1', 'palak')?.responseStatus, 'accepted', 'her reply reaches the CRM');
        assert.notEqual(state.connections[0].syncCursor, cursor, 'the cursor moves on');
    });

    it('a re-attached copy whose read back fails never holds the cursor when nothing replaces it', async () => {
        install({ importing: ['palak'] });
        done(await pullConnection('c1', 'poll'));
        fakeAddEvent(calendarMeeting('m9', { attendees: [{ email: 'stranger@else.com', responseStatus: 'accepted' }] }));
        const cursor = state.connections[0].syncCursor;
        state.activities.push(blankActivity({ id: 'crm2', subject: 'Review', assignedTo: 'asha', createdBy: 'asha', origin: 'crm', status: 'Planned', startAt: inDays(3), endAt: inDays(3) }));
        state.links.push(
            blankLink({ id: 'l-p2', activityId: 'crm2', connectionId: 'c1', provider: 'fake', requestedId: 'y', role: 'attendee', state: 'synced', externalEventId: 'm-old2', externalEventKey: eventKeyOf('m-old2'), etag: null }),
        );
        fakeProviderState.failNext.get = new ProviderTransientError({ provider: 'fake', operation: 'get-event', status: 503, code: 'backendError' });
        const result = done(await pullConnection('c1', 'poll'));
        assert.equal(result.counts.failed, 0);
        assert.notEqual(state.connections[0].syncCursor, cursor, 'the cursor moves on');
        assert.equal(state.links.find((l) => l.id === 'l-p2')?.etag, null, 'read again by the next pull');
    });

    it('a cursor dropped while a pull runs (meeting import switched on) stays dropped: the next pull is full', async () => {
        install({ importing: [] });
        fakeAddEvent(calendarMeeting('m1'));
        done(await pullConnection('c1', 'poll'));
        assert.ok(state.connections[0].syncCursor);
        const real = getAdapter('fake');
        let dropped = false;
        setAdapterForTests('fake', {
            ...real,
            listChanges: async (ctx, input) => {
                const page = await real.listChanges(ctx, input);
                if (!dropped) {
                    dropped = true;
                    // The admin switches import on while this incremental pull is listing.
                    state.calendarSyncUsers.push({ username: 'palak', provider: null, excluded: false, note: null, importMeetings: true } as (typeof state.calendarSyncUsers)[number]);
                    assert.equal(await startImportPulls(['palak']), 1);
                }
                return page;
            },
        });
        try {
            const before = state.connections[0].lastPulledAt;
            assert.equal(done(await pullConnection('c1', 'poll')).full, false);
            assert.equal(state.connections[0].syncCursor, null, 'the running pull did not put its cursor back');
            assert.notEqual(state.connections[0].lastPulledAt, before, 'bookkeeping still written');
            const full = done(await pullConnection('c1', 'poll'));
            assert.equal(full.full, true);
            assert.equal(full.counts.imported, 1);
        } finally {
            setAdapterForTests('fake', null);
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
