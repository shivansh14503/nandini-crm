import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ENV } from '../../config/env.js';
import type { AuthUser } from '../../types/user.types.js';
import { addDays, zonedDayOf, zonedWallClockToInstant } from '../../utils/zonedTime.js';
import { activitySeriesService } from '../activities/activity.series.js';
import { activityService } from '../activities/activity.service.js';
import { installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import { NEVER_REQUIRED_FIELDS } from '../form-configs/formConfig.defaults.js';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { fakeEditEvent, fakeFinishConference, fakeMeetUrl, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { ProviderBadRequestError, ProviderTransientError, resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { checkConference, failStaleConferences, markConferenceExhausted, setInlineConferenceCheckForTests, STALE_CONFERENCE_MS, type ConferenceJobData } from './sync.conference.js';
import { pullConnection, resetPullStateForTests } from './sync.pull.js';
import { parseBase, pushLink } from './sync.push.js';
import { setInlinePushForTests } from './sync.wake.js';
import { blankConnection, type ConnectionRowState } from './testing/connectionDouble.js';
import { setTokenSourceForTests } from './tokenSource.js';

/**
 * Video meetings end to end (Calendar Phase 3, P3-1; spec §16): CRM saves through activityService, then the push
 * against the in-memory fake calendar (Google-shaped: Meet links), and the `conference` job's reads.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const inDays = (days: number) => new Date(Math.floor((Date.now() + days * DAY) / 60_000) * 60_000);

const PALAK: AuthUser = { id: 1, username: 'palak', role: 'user' };
const USERS = [
    { username: 'palak', fullName: 'Palak Shah', isActive: true, email: 'palak@nandiniinfosys.com' },
    { username: 'ravi', fullName: 'Ravi Kumar', isActive: true, email: 'ravi@nandiniinfosys.com' },
];

/** Followup Types: Meeting offers a video meeting; Call goes to calendars without one; Task never does. */
const CONFIGS = {
    categories: [
        {
            id: 'cat-ft',
            key: 'shared_followup_type',
            label: 'Followup Type',
            module: 'shared',
            options: [
                { value: 'Meeting', meta: { durationMinutes: 60, videoMeeting: true } },
                { value: 'Call', meta: { durationMinutes: 15 } },
                { value: 'Task', meta: { durationMinutes: 0 }, isSystem: true },
            ].map((o, i) => ({ id: `opt-${o.value}`, categoryId: 'cat-ft', label: o.value, sortOrder: i, isActive: true, isSystem: false, isDefault: false, ...o })),
        },
    ],
    fieldsByModule: {},
    moduleTabs: {},
    moduleSettings: {},
} as unknown as FormConfigsPayload;

const conn = (over: Partial<ConnectionRowState> = {}) =>
    blankConnection({ id: 'c1', username: 'palak', provider: 'fake', accountEmail: 'palak@nandiniinfosys.com', status: 'ok', backfilledAt: new Date(0), ...over });

let state: ActivityDoubleState;
let checks: ConferenceJobData[];

const install = (connections: ConnectionRowState[] = [conn()]) => (state = installActivityDouble({ users: USERS, connections, configs: CONFIGS }));

const meeting = (over: Record<string, unknown> = {}) => ({
    followupType: 'Meeting',
    subject: 'Demo with ACME',
    assignedTo: 'palak',
    startAt: inDays(2).toISOString(),
    endAt: new Date(inDays(2).getTime() + HOUR).toISOString(),
    ...over,
});

const rowOf = (id: string) => state.activities.find((a) => a.id === id)!;
const linkOf = (activityId: string) => state.links.find((l) => l.activityId === activityId)!;
const eventOf = (activityId: string) => fakeProviderState.events.get(linkOf(activityId).externalEventId as string)!;

async function expectHttp(promise: Promise<unknown>, status: number, code?: string) {
    await assert.rejects(promise, (err: { statusCode?: number; status?: number; details?: { code?: string }; code?: string }) => {
        assert.equal(err.statusCode ?? err.status, status);
        if (code) assert.equal(err.details?.code ?? err.code, code);
        return true;
    });
}

beforeEach(() => {
    resetFakeProvider();
    resetProviderPauses();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(true);
    setTokenSourceForTests(null);
    setInlinePushForTests(() => {});
    checks = [];
    setInlineConferenceCheckForTests((data) => checks.push(data));
});

afterEach(() => {
    restoreActivityDouble();
    setFakeProviderEnabledForTests(null);
    setInlinePushForTests(null);
    setInlineConferenceCheckForTests(null);
});

describe('Video meeting on a CRM save', () => {
    it('a new Meet choice is stored as requested (request 1) and the push asks Google with <requestedId>-c1', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        assert.equal(rowOf(view.id).conferenceProvider, 'meet');
        assert.equal(rowOf(view.id).conferenceState, 'requested');
        assert.equal(rowOf(view.id).conferenceRequest, 1);
        assert.equal(view.conference?.state, 'requested');

        assert.equal((await pushLink(linkOf(view.id).id)).status, 'done');
        const event = eventOf(view.id);
        assert.equal(event.conferenceData?.createRequest?.requestId, `${linkOf(view.id).requestedId}-c1`);
        const row = rowOf(view.id);
        assert.equal(row.conferenceState, 'ready');
        assert.equal(row.conferenceJoinUrl, event.hangoutLink);
        assert.ok(row.conferenceJoinUrl?.startsWith('https://meet.google.com/'));
        assert.equal(row.updatedAt.getTime(), view.updatedAt ? new Date(view.updatedAt).getTime() : row.updatedAt.getTime(), 'not a user edit');
        // The base keeps what was sent; the link is pushed once more with the join line in the description.
        assert.equal(parseBase(linkOf(view.id).baseJson)?.crm.description.includes('Join with Google Meet'), false);
        assert.equal(linkOf(view.id).state, 'pending');
        await pushLink(linkOf(view.id).id);
        assert.ok(eventOf(view.id).description?.endsWith(`Join with Google Meet: ${row.conferenceJoinUrl}`));
        assert.ok(parseBase(linkOf(view.id).baseJson)?.crm.description.endsWith(`Join with Google Meet: ${row.conferenceJoinUrl}`));
        assert.equal(linkOf(view.id).state, 'synced');
    });

    it('Google answering pending: the conference job reads again until the link is ready', async () => {
        install();
        fakeProviderState.conferenceMode = 'pending';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(rowOf(view.id).conferenceState, 'requested');
        assert.deepEqual(checks, [{ linkId: linkOf(view.id).id, request: 1, attempt: 1 }]);

        assert.equal(await checkConference(checks[0]), 'pending', 'still pending: the next try is queued');
        assert.equal(checks.length, 2);
        assert.equal(checks[1].attempt, 2);

        fakeFinishConference(linkOf(view.id).externalEventId as string);
        assert.equal(await checkConference(checks[1]), 'ready');
        assert.equal(rowOf(view.id).conferenceJoinUrl, eventOf(view.id).hangoutLink);
        assert.equal(await checkConference(checks[1]), 'settled', 'a settled request is a no-op');
    });

    it('the last try gives up (failed conference_timeout); Retry asks again with a new request number', async () => {
        install();
        fakeProviderState.conferenceMode = 'pending';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(await checkConference({ ...checks[0], attempt: 5 }), 'failed');
        assert.equal(rowOf(view.id).conferenceState, 'failed');
        assert.match(rowOf(view.id).conferenceError ?? '', /^conference_timeout: /);
        const failed = await activityService.getById(view.id, PALAK);
        assert.equal(failed.conference?.canRetry, true);
        assert.equal(failed.conference?.errorCode, 'conference_timeout');

        fakeProviderState.conferenceMode = 'success';
        const retried = await activityService.retryConference(view.id, PALAK);
        assert.equal(retried.conference?.state, 'requested');
        assert.equal(rowOf(view.id).conferenceRequest, 2);
        await pushLink(linkOf(view.id).id);
        assert.equal(eventOf(view.id).conferenceData?.createRequest?.requestId, `${linkOf(view.id).requestedId}-c2`);
        assert.equal(rowOf(view.id).conferenceState, 'ready');
        await expectHttp(activityService.retryConference(view.id, PALAK), 409, 'NOTHING_TO_RETRY');
    });

    it('Google failing the request: failed conference_failed', async () => {
        install();
        fakeProviderState.conferenceMode = 'failure';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        assert.match(rowOf(view.id).conferenceError ?? '', /^conference_failed: /);
        assert.equal(rowOf(view.id).conferenceJoinUrl, null);
    });

    it('removing a Meet clears the columns and sends conferenceData null', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { videoMeeting: null }, PALAK);
        assert.equal(rowOf(view.id).conferenceProvider, null);
        assert.equal(rowOf(view.id).conferenceJoinUrl, null);
        await pushLink(linkOf(view.id).id);
        assert.equal(eventOf(view.id).hangoutLink ?? null, null);
        assert.equal(rowOf(view.id).conferenceProvider, null, 'the removed Meet is not adopted back');
    });

    it('a Meet added in the calendar directly is taken over read only', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        const id = linkOf(view.id).externalEventId as string;
        const event = fakeProviderState.events.get(id)!;
        fakeProviderState.events.set(id, { ...event, hangoutLink: fakeMeetUrl('aaa-bbbb-ccc'), conferenceData: { conferenceId: 'aaa-bbbb-ccc', conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: fakeMeetUrl('aaa-bbbb-ccc') }] } });
        await activityService.update(view.id, { location: 'Room 2' }, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(rowOf(view.id).conferenceProvider, 'meet');
        assert.equal(rowOf(view.id).conferenceState, 'ready');
        assert.equal(rowOf(view.id).conferenceJoinUrl, fakeMeetUrl('aaa-bbbb-ccc'));
    });

    it("409 VIDEO_PROVIDER_NOT_CONNECTED when the owner's calendar can't make the link (none, or another kind; Zoom later)", async () => {
        install([]);
        await expectHttp(activityService.create(meeting({ videoMeeting: 'meet' }), PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
        install();
        await expectHttp(activityService.create(meeting({ videoMeeting: 'teams' }), PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
        await expectHttp(activityService.create(meeting({ videoMeeting: 'zoom' }), PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await expectHttp(activityService.update(view.id, { assignedTo: 'ravi', videoMeeting: 'teams' }, PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
    });

    it("an owner change is never blocked: the new owner's calendar makes a new link, or the link shows failed (no Retry)", async () => {
        install([conn(), conn({ id: 'c2', username: 'ravi', accountEmail: 'ravi@nandiniinfosys.com' })]);
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(rowOf(view.id).conferenceState, 'ready');
        await activityService.update(view.id, { assignedTo: 'ravi' }, PALAK);
        assert.equal(rowOf(view.id).conferenceState, 'requested', 'Ravi has a Google calendar: a new Meet');
        assert.equal(rowOf(view.id).conferenceRequest, 2);

        state.connections = state.connections.filter((c) => c.username !== 'palak');
        const moved = await activityService.update(view.id, { assignedTo: 'palak' }, PALAK);
        assert.equal(rowOf(view.id).conferenceProvider, 'meet');
        assert.equal(rowOf(view.id).conferenceState, 'failed');
        assert.equal(moved.conference?.errorCode, 'provider_unavailable');
        assert.equal(moved.conference?.canRetry, false, 'Retry cannot help: pick another option or None');
        await expectHttp(activityService.retryConference(view.id, PALAK), 409, 'NOTHING_TO_RETRY');
        await activityService.update(view.id, { videoMeeting: null }, PALAK);
        assert.equal(rowOf(view.id).conferenceProvider, null);
    });

    it('a logged activity keeps its link on an owner change, and offers no Retry', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        const url = rowOf(view.id).conferenceJoinUrl;
        await activityService.update(view.id, { status: 'Completed', assignedTo: 'ravi' }, PALAK);
        assert.equal(rowOf(view.id).conferenceState, 'ready');
        assert.equal(rowOf(view.id).conferenceJoinUrl, url);

        Object.assign(rowOf(view.id), { conferenceState: 'failed', conferenceJoinUrl: null, conferenceError: 'conference_timeout: x' });
        const read = await activityService.getById(view.id, PALAK);
        assert.equal(read.conference?.canRetry, false, 'not Planned: Retry is refused, so it is not offered');
    });

    it('400 for a type that does not offer it, or an activity that is not Planned; Task / Note drop it', async () => {
        install();
        await expectHttp(activityService.create(meeting({ followupType: 'Call', videoMeeting: 'meet' }), PALAK), 400);
        await expectHttp(activityService.create(meeting({ status: 'Completed', videoMeeting: 'meet', startAt: inDays(-1).toISOString(), endAt: new Date(inDays(-1).getTime() + HOUR).toISOString() }), PALAK), 400);
        const task = await activityService.create(meeting({ followupType: 'Task', videoMeeting: 'meet' }), PALAK);
        assert.equal(rowOf(task.id).conferenceProvider, null);
    });

    it('Video meeting is never required: a config that marks it Required does not block a Call or a Meeting without one', async () => {
        state = installActivityDouble({
            users: USERS,
            connections: [conn()],
            configs: {
                ...CONFIGS,
                fieldsByModule: {
                    activities: [{ id: 'f-vm', fieldKey: 'videoMeeting', label: 'Video meeting', fieldType: 'lookup', isSystem: true, isActive: true, isVisibleInForm: true, isRequired: true, isDeleted: false }],
                },
            } as unknown as FormConfigsPayload,
        });
        const call = await activityService.create(meeting({ followupType: 'Call' }), PALAK);
        assert.equal(rowOf(call.id).conferenceProvider, null);
        await activityService.create(meeting(), PALAK);
        assert.equal(NEVER_REQUIRED_FIELDS.activities?.has('videoMeeting'), true, 'the Form Builder refuses Required on it');
    });

    it('video options follow the owner’s calendar', async () => {
        install();
        const options = await activityService.videoOptions({ owner: 'palak' }, PALAK);
        assert.equal(options.calendarProvider, 'fake');
        assert.deepEqual(
            options.options.map((o) => [o.value, o.available]),
            [
                ['meet', true],
                ['teams', false],
                ['zoom', false],
            ],
        );
        const none = await activityService.videoOptions({ owner: 'ravi' }, PALAK);
        assert.equal(none.calendarProvider, null);
        assert.equal(none.options.some((o) => o.available), false);
    });
});

describe('Every wait for a link ends', () => {
    it('a calendar refusing the Meet (400): the event still syncs without it, the link is failed not_created', async () => {
        install();
        fakeProviderState.conferenceMode = 'refused';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        assert.equal((await pushLink(linkOf(view.id).id)).status, 'done');
        assert.equal(linkOf(view.id).state, 'synced');
        assert.equal(eventOf(view.id).conferenceData ?? null, null);
        assert.equal(rowOf(view.id).conferenceState, 'failed');
        assert.match(rowOf(view.id).conferenceError ?? '', /^not_created: /);
        assert.equal((await activityService.getById(view.id, PALAK)).conference?.canRetry, true);

        // Retry while Meet is still off: the patch's video part is refused again, nothing else to send.
        await activityService.retryConference(view.id, PALAK);
        assert.equal((await pushLink(linkOf(view.id).id)).status, 'done');
        assert.equal(linkOf(view.id).state, 'synced');
        assert.match(rowOf(view.id).conferenceError ?? '', /^not_created: /);

        fakeProviderState.conferenceMode = 'success';
        await activityService.retryConference(view.id, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(rowOf(view.id).conferenceState, 'ready');
    });

    it('a read that cannot be made uses up a try; a missing event is failed no_event', async () => {
        install();
        fakeProviderState.conferenceMode = 'pending';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        fakeProviderState.failNext.get = new ProviderTransientError({ provider: 'fake', operation: 'get-event', status: 503, code: 'backendError' });
        assert.equal(await checkConference(checks[0]), 'pending');
        assert.equal(checks.at(-1)?.attempt, 2, 'the next try is queued');
        fakeProviderState.failNext.get = new ProviderTransientError({ provider: 'fake', operation: 'get-event', status: 503, code: 'backendError' });
        assert.equal(await checkConference({ ...checks[0], attempt: 5 }), 'failed', 'the last try gives up');
        assert.match(rowOf(view.id).conferenceError ?? '', /^conference_timeout: /);

        const other = await activityService.create(meeting({ videoMeeting: 'meet', subject: 'Second' }), PALAK);
        await pushLink(linkOf(other.id).id);
        fakeProviderState.events.delete(linkOf(other.id).externalEventId as string);
        assert.equal(await checkConference(checks.at(-1)!), 'failed');
        assert.match(rowOf(other.id).conferenceError ?? '', /^no_event: /);
    });

    it('the nightly sweep fails links still requested an hour after the last save; the worker’s last attempt too', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        const saved = rowOf(view.id).updatedAt.getTime();
        assert.equal(await failStaleConferences(new Date(saved + 60_000)), 0, 'a fresh request waits');
        assert.equal(await failStaleConferences(new Date(saved + STALE_CONFERENCE_MS + 60_000)), 1);
        assert.match(rowOf(view.id).conferenceError ?? '', /^conference_timeout: /);

        const other = await activityService.create(meeting({ videoMeeting: 'meet', subject: 'Second' }), PALAK);
        fakeProviderState.conferenceMode = 'pending';
        await pushLink(linkOf(other.id).id);
        await markConferenceExhausted({ linkId: linkOf(other.id).id, request: 2 });
        assert.equal(rowOf(other.id).conferenceState, 'requested', 'another request number is left alone');
        await markConferenceExhausted({ linkId: linkOf(other.id).id, request: 1 });
        assert.equal(rowOf(other.id).conferenceState, 'failed');
    });

    it('a push that fails for good fails a waiting link (Retry offered)', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        // Refused with and without the video part.
        fakeProviderState.onCall = async (op) => {
            if (op === 'create') throw new ProviderBadRequestError({ provider: 'fake', operation: 'create-event', status: 400, code: 'invalid', providerMessage: 'Bad request.' });
        };
        await pushLink(linkOf(view.id).id);
        assert.equal(fakeProviderState.eventCalls.filter((c) => c.op === 'create').length, 2);
        assert.equal(linkOf(view.id).state, 'error');
        assert.match(rowOf(view.id).conferenceError ?? '', /^event_refused: /);
        assert.equal((await activityService.getById(view.id, PALAK)).conference?.canRetry, true);
    });

    it('a restore without a wanted Meet removes the old one instead of taking it over again', async () => {
        install();
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        await pushLink(linkOf(view.id).id);
        await activityService.update(view.id, { status: 'Cancelled', videoMeeting: null }, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(linkOf(view.id).state, 'cancelled');
        await activityService.update(view.id, { status: 'Planned' }, PALAK);
        await pushLink(linkOf(view.id).id);
        assert.equal(eventOf(view.id).status, 'confirmed');
        assert.equal(eventOf(view.id).hangoutLink ?? null, null);
        assert.equal(rowOf(view.id).conferenceProvider, null, 'the removed Meet is not adopted back');
    });
});

describe('Teams lock', () => {
    it('a ready Teams link cannot be removed or changed (409 VIDEO_MEETING_LOCKED)', async () => {
        install([conn({ provider: 'microsoft' })]);
        const view = await activityService.create(meeting(), PALAK);
        Object.assign(rowOf(view.id), { conferenceProvider: 'teams', conferenceState: 'ready', conferenceJoinUrl: 'https://teams.microsoft.com/l/meetup-join/1', conferenceRequest: 1 });
        await expectHttp(activityService.update(view.id, { videoMeeting: null }, PALAK), 409, 'VIDEO_MEETING_LOCKED');
        await expectHttp(activityService.update(view.id, { videoMeeting: 'meet' }, PALAK), 409, 'VIDEO_MEETING_LOCKED');
        await activityService.update(view.id, { remarks: 'Bring the brochure', videoMeeting: 'teams' }, PALAK);
        const read = await activityService.getById(view.id, PALAK);
        assert.equal(read.conference?.locked, true);
        assert.equal(read.videoMeeting, 'teams');
        assert.deepEqual(read.lockedFields, [], 'not the follow-up lock: the form reads conference.locked');
    });

    it('a locked Teams activity can still be given to someone else (the link shows failed when their calendar cannot make it)', async () => {
        install([conn({ provider: 'microsoft' })]);
        const view = await activityService.create(meeting(), PALAK);
        Object.assign(rowOf(view.id), { conferenceProvider: 'teams', conferenceState: 'ready', conferenceJoinUrl: 'https://teams.microsoft.com/l/meetup-join/1', conferenceRequest: 1 });
        const moved = await activityService.update(view.id, { assignedTo: 'ravi' }, PALAK);
        assert.equal(rowOf(view.id).assignedTo, 'ravi');
        assert.equal(moved.conference?.errorCode, 'provider_unavailable');
        assert.equal(moved.conference?.locked, false);
        await activityService.update(view.id, { videoMeeting: null }, PALAK);
        assert.equal(rowOf(view.id).conferenceProvider, null);
    });
});

describe('Video meeting through the pull (P2-5 organizer copies)', () => {
    const later = (ms = 60_000) => new Date(Date.now() + ms);
    const meetData = (conferenceId: string, url: string) => ({
        hangoutLink: url,
        conferenceData: { conferenceId, conferenceSolution: { key: { type: 'hangoutsMeet' } }, entryPoints: [{ entryPointType: 'video', uri: url }] },
    });

    beforeEach(() => resetPullStateForTests());

    it('a Meet added in the calendar is taken over read only (allow-listed URL); the join details go out without a new Meet', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        const eventId = linkOf(view.id).externalEventId as string;
        fakeEditEvent(eventId, meetData('aaa-bbbb-ccc', fakeMeetUrl('aaa-bbbb-ccc')), later());
        assert.equal((await pullConnection('c1', 'poll')).status, 'done');
        const row = rowOf(view.id);
        assert.equal(row.conferenceProvider, 'meet');
        assert.equal(row.conferenceState, 'ready');
        assert.equal(row.conferenceJoinUrl, fakeMeetUrl('aaa-bbbb-ccc'));
        assert.equal(row.conferenceRequest, 0);
        assert.deepEqual(parseBase(linkOf(view.id).baseJson)?.crm.conference, { provider: 'meet', request: 0 }, 'the base records it: no new Meet is asked for');
        assert.ok(linkOf(view.id).dirtyAt, 'one more push for the join details');

        await pushLink(linkOf(view.id).id);
        assert.equal(eventOf(view.id).conferenceData?.createRequest, undefined);
        assert.equal(eventOf(view.id).conferenceData?.conferenceId, 'aaa-bbbb-ccc');
        assert.ok(eventOf(view.id).description?.endsWith(`Join with Google Meet: ${fakeMeetUrl('aaa-bbbb-ccc')}`));
        assert.equal(linkOf(view.id).state, 'synced');
    });

    it('a link whose URL fails the allow-list is not taken over', async () => {
        install();
        const view = await activityService.create(meeting(), PALAK);
        await pushLink(linkOf(view.id).id);
        fakeEditEvent(linkOf(view.id).externalEventId as string, meetData('evil', 'https://meet.example.com/evil'), later());
        assert.equal((await pullConnection('c1', 'poll')).status, 'done');
        assert.equal(rowOf(view.id).conferenceProvider, null);
        assert.equal(rowOf(view.id).conferenceJoinUrl, null);
    });

    it('a requested Meet: pending stays requested, ready is recorded, and a Meet removed in the calendar stays in the CRM', async () => {
        install();
        fakeProviderState.conferenceMode = 'pending';
        const view = await activityService.create(meeting({ videoMeeting: 'meet' }), PALAK);
        await pushLink(linkOf(view.id).id);
        const eventId = linkOf(view.id).externalEventId as string;
        fakeEditEvent(eventId, { location: 'Room 4' }, later());
        assert.equal((await pullConnection('c1', 'poll')).status, 'done');
        assert.equal(rowOf(view.id).location, 'Room 4');
        assert.equal(rowOf(view.id).conferenceState, 'requested', 'still waiting: the pull never fails or clears it');
        assert.equal(checks.length, 1, 'no second check queued by the pull');

        fakeFinishConference(eventId, 'success', later(120_000));
        assert.equal((await pullConnection('c1', 'poll')).status, 'done');
        const ready = rowOf(view.id);
        assert.equal(ready.conferenceState, 'ready');
        assert.equal(ready.conferenceJoinUrl, eventOf(view.id).hangoutLink);
        assert.equal(ready.conferenceRequest, 1);

        fakeEditEvent(eventId, { hangoutLink: null, conferenceData: null }, later(180_000));
        assert.equal((await pullConnection('c1', 'poll')).status, 'done');
        assert.equal(rowOf(view.id).conferenceProvider, 'meet');
        assert.equal(rowOf(view.id).conferenceState, 'ready');
        assert.equal(rowOf(view.id).conferenceJoinUrl, ready.conferenceJoinUrl);
    });
});

describe('Video meeting on recurring activities (Calendar Phase 4)', () => {
    /** A daily Meet series from tomorrow at 10:00 business time, `count` occurrences. */
    async function meetSeries(count: number) {
        const day = addDays(zonedDayOf(new Date(), ENV.BUSINESS_TIMEZONE), 1);
        const start = zonedWallClockToInstant(`${day}T10:00`, ENV.BUSINESS_TIMEZONE);
        const view = await activitySeriesService.create(
            meeting({ subject: 'Daily stand-up', videoMeeting: 'meet', startAt: start.toISOString(), endAt: new Date(start.getTime() + HOUR).toISOString(), repeat: { frequency: 'daily', ends: 'after', count } }),
            PALAK,
        );
        const rows = state.activities.filter((a) => a.seriesId === view.seriesId && !a.isDeleted).sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));
        return { view, rows };
    }
    const linkFor = (activityId: string) => state.links.find((l) => l.activityId === activityId);

    it('every occurrence asks for its own link when pushed; the template keeps only the choice', async () => {
        install();
        const { rows } = await meetSeries(3);
        assert.equal(rows.length, 3);
        assert.ok(rows.every((r) => r.conferenceProvider === 'meet' && r.conferenceState === 'requested' && r.conferenceRequest === 1 && !r.conferenceJoinUrl));
        const template = JSON.parse(state.series[0].templateJson) as Record<string, unknown>;
        assert.equal(template.videoMeeting, 'meet');
        assert.ok(Object.keys(template).every((key) => !key.startsWith('conference')), 'no link, id, state or request in the template');

        for (const row of rows) assert.equal((await pushLink(linkOf(row.id).id)).status, 'done');
        const requestIds = rows.map((r) => eventOf(r.id).conferenceData?.createRequest?.requestId);
        assert.deepEqual(requestIds, rows.map((r) => `${linkOf(r.id).requestedId}-c1`));
        assert.equal(new Set(requestIds).size, 3);
        const urls = rows.map((r) => rowOf(r.id).conferenceJoinUrl);
        assert.ok(urls.every((u) => u?.startsWith('https://meet.google.com/')));
        assert.equal(new Set(urls).size, 3, 'each occurrence has its own Meet link');

        // The nightly horizon extension copies the choice, not another occurrence's link.
        const open = await activitySeriesService.create(
            meeting({ subject: 'Open-ended', videoMeeting: 'meet', startAt: rows[0].startAt!.toISOString(), endAt: rows[0].endAt!.toISOString(), repeat: { frequency: 'daily' } }),
            PALAK,
        );
        for (const row of state.activities.filter((a) => a.seriesId === open.seriesId && linkFor(a.id))) await pushLink(linkOf(row.id).id);
        const before = new Set(state.activities.map((a) => a.id));
        const result = await activitySeriesService.runNightly(new Date(Date.now() + 5 * DAY));
        const added = state.activities.filter((a) => !before.has(a.id));
        assert.ok(result.created >= 4 && added.length === result.created, JSON.stringify(result));
        assert.ok(added.every((a) => a.seriesId === open.seriesId && a.conferenceProvider === 'meet' && a.conferenceState === 'requested' && a.conferenceRequest === 1 && !a.conferenceJoinUrl && !a.conferenceId));
    });

    it('the stale sweep leaves occurrences that are not pushed yet (outside the 14-day window) waiting', async () => {
        install();
        const { rows } = await meetSeries(20);
        const inside = rows.filter((r) => linkFor(r.id));
        const outside = rows.filter((r) => !linkFor(r.id));
        assert.ok(inside.length >= 13 && outside.length >= 5, `${inside.length} inside, ${outside.length} outside`);
        // Push all but the last one inside the window (its owner's calendar never answered).
        const stuck = inside.at(-2)!;
        for (const row of inside) if (row.id !== stuck.id) await pushLink(linkOf(row.id).id);

        const later = new Date(Date.now() + STALE_CONFERENCE_MS + 60_000);
        const failed = await failStaleConferences(later);
        assert.equal(rowOf(stuck.id).conferenceState, 'failed', 'pushed long ago inside the window: Retry offered');
        assert.ok(outside.every((r) => rowOf(r.id).conferenceState === 'requested'), 'not pushed yet: still waiting');
        assert.equal(rowOf(inside.at(-1)!.id).conferenceState, 'ready');
        assert.equal(failed, 1);
    });

    it('the stale sweep waits for an occurrence inside the window that has no calendar copy yet, until the day before it starts', async () => {
        install();
        const { rows } = await meetSeries(20);
        // As if the nightly window mark hadn't reached these yet (a backlog): no calendar copy at all.
        const unmarked = rows.filter((r) => linkFor(r.id)).slice(0, 6);
        state.links = state.links.filter((l) => !unmarked.some((r) => r.id === l.activityId));
        const tomorrow = unmarked[0]; // starts tomorrow 10:00, less than two days away
        const later = new Date(Date.now() + STALE_CONFERENCE_MS + 60_000);
        await failStaleConferences(later);
        assert.ok(unmarked.slice(2).every((r) => rowOf(r.id).conferenceState === 'requested'), 'no copy yet: still waiting');
        const nearStart = new Date(tomorrow.startAt!.getTime() - DAY / 2);
        await failStaleConferences(nearStart);
        assert.equal(rowOf(tomorrow.id).conferenceState, 'failed', 'starts within a day and no push came: Retry offered');
    });

    it('an occurrence without a calendar copy shows its link as waiting for the calendar, not as being created', async () => {
        install();
        const { rows } = await meetSeries(20);
        const outside = rows.find((r) => !linkFor(r.id))!;
        const inside = rows.find((r) => linkFor(r.id))!;
        const far = await activityService.getById(outside.id, PALAK);
        assert.equal(far.conference?.state, 'requested');
        assert.equal(far.conference?.waitingForCalendar, true);
        const near = await activityService.getById(inside.id, PALAK);
        assert.equal(near.conference?.waitingForCalendar, false, 'has a calendar copy: the push creates it now');
    });

    it('"All events" changes the choice on future occurrences, never on an exception; a ready Teams occurrence blocks it (409)', async () => {
        install();
        const { rows } = await meetSeries(4);
        for (const row of rows) await pushLink(linkOf(row.id).id);
        const exception = rows[2];
        await activitySeriesService.update(exception.id, { subject: 'Stand-up with Ravi' }, PALAK, { scope: 'this' });
        assert.equal(rowOf(exception.id).seriesException, true);
        const exceptionUrl = rowOf(exception.id).conferenceJoinUrl;
        assert.ok(exceptionUrl);

        await activitySeriesService.update(rows[0].id, { videoMeeting: '' }, PALAK, { scope: 'all' });
        assert.equal(JSON.parse(state.series[0].templateJson).videoMeeting, null);
        for (const row of [rows[0], rows[1], rows[3]]) {
            assert.equal(rowOf(row.id).conferenceProvider, null);
            assert.equal(rowOf(row.id).conferenceJoinUrl, null);
        }
        assert.equal(rowOf(exception.id).conferenceProvider, 'meet', 'the exception keeps its link');
        assert.equal(rowOf(exception.id).conferenceJoinUrl, exceptionUrl);

        await activitySeriesService.update(rows[0].id, { videoMeeting: 'meet' }, PALAK, { scope: 'all' });
        for (const row of [rows[0], rows[1], rows[3]]) {
            assert.equal(rowOf(row.id).conferenceState, 'requested');
            assert.equal(rowOf(row.id).conferenceRequest, 2, 'a new request of its own');
        }
        assert.equal(rowOf(exception.id).conferenceJoinUrl, exceptionUrl);

        // A ready Teams link on one occurrence: removing the video meeting from all events is refused as a whole.
        Object.assign(rowOf(rows[3].id), { conferenceProvider: 'teams', conferenceState: 'ready', conferenceJoinUrl: 'https://teams.microsoft.com/l/meetup-join/1' });
        await expectHttp(activitySeriesService.update(rows[0].id, { videoMeeting: null }, PALAK, { scope: 'all' }), 409, 'VIDEO_MEETING_LOCKED');
        assert.equal(rowOf(rows[1].id).conferenceProvider, 'meet', 'rolled back');
    });

    it("a series asks the owner's calendar like a single save (409 VIDEO_PROVIDER_NOT_CONNECTED)", async () => {
        install();
        const day = addDays(zonedDayOf(new Date(), ENV.BUSINESS_TIMEZONE), 1);
        const start = zonedWallClockToInstant(`${day}T10:00`, ENV.BUSINESS_TIMEZONE);
        const body = meeting({ videoMeeting: 'teams', startAt: start.toISOString(), endAt: new Date(start.getTime() + HOUR).toISOString(), repeat: { frequency: 'daily', ends: 'after', count: 3 } });
        await expectHttp(activitySeriesService.create(body, PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
        assert.equal(state.series.length, 0);
        assert.equal(state.activities.length, 0);
    });
});
