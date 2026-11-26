import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import { activityService } from '../activities/activity.service.js';
import { installActivityDouble, restoreActivityDouble, type ActivityDoubleState } from '../activities/testing/activityDouble.js';
import type { FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { fakeFinishConference, fakeMeetUrl, fakeProviderState, resetFakeProvider } from './providers/fake.js';
import { resetProviderPauses } from './providers/http.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from './providers/registry.js';
import { checkConference, setInlineConferenceCheckForTests, type ConferenceJobData } from './sync.conference.js';
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
        // Google shows the Meet itself; the join line rides with the next description write (the base records it).
        assert.ok(parseBase(linkOf(view.id).baseJson)?.crm.description.endsWith(`Join with Google Meet: ${row.conferenceJoinUrl}`));
        assert.equal(row.updatedAt.getTime(), view.updatedAt ? new Date(view.updatedAt).getTime() : row.updatedAt.getTime(), 'not a user edit');
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
        await expectHttp(activityService.update(view.id, { assignedTo: 'ravi' }, PALAK), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
    });

    it('400 for a type that does not offer it, or an activity that is not Planned; Task / Note drop it', async () => {
        install();
        await expectHttp(activityService.create(meeting({ followupType: 'Call', videoMeeting: 'meet' }), PALAK), 400);
        await expectHttp(activityService.create(meeting({ status: 'Completed', videoMeeting: 'meet', startAt: inDays(-1).toISOString(), endAt: new Date(inDays(-1).getTime() + HOUR).toISOString() }), PALAK), 400);
        const task = await activityService.create(meeting({ followupType: 'Task', videoMeeting: 'meet' }), PALAK);
        assert.equal(rowOf(task.id).conferenceProvider, null);
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
    });
});
