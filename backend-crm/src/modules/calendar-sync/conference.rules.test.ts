import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    conferenceErrorOf,
    conferenceOutcome,
    conferenceRequestId,
    conferenceWriteFor,
    googleConferenceBody,
    graphConferenceBody,
    parseConferenceError,
    readGoogleConference,
    readGraphConference,
    safeJoinUrl,
    videoMeetingFromMeta,
    videoProviderForCalendar,
    videoUnavailableMessage,
    withJoinDetails,
    type ActivityConference,
} from './conference.rules.js';

/** Video meetings, pure rules (Calendar Phase 3, P3-1; spec §16). */

const requested = (over: Partial<ActivityConference> = {}): ActivityConference => ({
    conferenceProvider: 'meet',
    conferenceState: 'requested',
    conferenceJoinUrl: null,
    conferenceId: null,
    conferenceRequest: 1,
    ...over,
});

describe('join URL allow-list', () => {
    it('keeps https links of the provider host only', () => {
        assert.equal(safeJoinUrl('https://meet.google.com/abc-defg-hij', 'meet'), 'https://meet.google.com/abc-defg-hij');
        assert.equal(safeJoinUrl(' https://teams.microsoft.com/l/meetup-join/19%3a1 ', 'teams'), 'https://teams.microsoft.com/l/meetup-join/19%3a1');
        assert.equal(safeJoinUrl('https://acme.zoom.us/j/1', 'zoom'), 'https://acme.zoom.us/j/1');
    });
    it('refuses http, other hosts, look-alikes, credentials, ports, junk and long links', () => {
        assert.equal(safeJoinUrl('http://meet.google.com/abc', 'meet'), null);
        assert.equal(safeJoinUrl('https://teams.microsoft.com/l/x', 'meet'), null);
        assert.equal(safeJoinUrl('https://meet.google.com.evil.io/abc', 'meet'), null);
        assert.equal(safeJoinUrl('https://user:pw@meet.google.com/abc', 'meet'), null);
        assert.equal(safeJoinUrl('https://meet.google.com:8443/abc', 'meet'), null);
        assert.equal(safeJoinUrl('javascript:alert(1)', 'meet'), null);
        assert.equal(safeJoinUrl('not a url', 'meet'), null);
        assert.equal(safeJoinUrl(`https://meet.google.com/${'a'.repeat(1000)}`, 'meet'), null);
        assert.equal(safeJoinUrl('https://zoom.us.evil.io/j/1', 'zoom'), null);
    });
});

describe('provider answers', () => {
    it('Google: a ready Meet from conferenceData (video entry point wins over hangoutLink)', () => {
        const read = readGoogleConference({
            hangoutLink: 'https://meet.google.com/old-link',
            conferenceData: {
                conferenceId: 'abc-defg-hij',
                conferenceSolution: { key: { type: 'hangoutsMeet' } },
                entryPoints: [
                    { entryPointType: 'phone', uri: 'tel:+1-555' },
                    { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
                ],
                createRequest: { requestId: 'r-c1', status: { statusCode: 'success' } },
            },
        });
        assert.deepEqual(read, { provider: 'meet', status: 'ready', joinUrl: 'https://meet.google.com/abc-defg-hij', urlRejected: false, conferenceId: 'abc-defg-hij', requestId: 'r-c1' });
    });
    it('Google: pending / failure create requests, a hangoutLink alone, an untrusted link, add-ons ignored', () => {
        assert.equal(readGoogleConference({ conferenceData: { createRequest: { requestId: 'r-c1', status: { statusCode: 'pending' } } } })?.status, 'pending');
        assert.equal(readGoogleConference({ conferenceData: { createRequest: { requestId: 'r-c1', status: { statusCode: 'failure' } } } })?.status, 'failed');
        assert.equal(readGoogleConference({ hangoutLink: 'https://meet.google.com/x-y-z' })?.joinUrl, 'https://meet.google.com/x-y-z');
        const bad = readGoogleConference({ hangoutLink: 'https://evil.io/x' });
        assert.equal(bad?.status, 'ready');
        assert.equal(bad?.urlRejected, true);
        assert.equal(readGoogleConference({ conferenceData: { conferenceSolution: { key: { type: 'addOn' } }, entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.us/j/1' }] } }), undefined);
        assert.equal(readGoogleConference({}), undefined);
    });
    it('Graph: onlineMeeting.joinUrl of a Teams meeting; pending until the URL comes; other providers ignored', () => {
        assert.deepEqual(
            readGraphConference({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/1', conferenceId: '123' } }),
            { provider: 'teams', status: 'ready', joinUrl: 'https://teams.microsoft.com/l/meetup-join/1', urlRejected: false, conferenceId: '123', requestId: null },
        );
        assert.equal(readGraphConference({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' })?.status, 'pending');
        assert.equal(readGraphConference({ isOnlineMeeting: true, onlineMeetingProvider: 'skypeForConsumer', onlineMeeting: { joinUrl: 'https://join.skype.com/x' } }), undefined);
        assert.equal(readGraphConference({ isOnlineMeeting: false }), undefined);
    });
});

describe('what the push sends', () => {
    it("Meet on Google (requestId '<requestedId>-c<n>'), Teams on Microsoft, nothing for a provider the calendar can't make", () => {
        assert.equal(conferenceRequestId('rq', 3), 'rq-c3');
        assert.deepEqual(conferenceWriteFor('google', { provider: 'meet', request: 2 }, null, 'rq'), { kind: 'meet', requestId: 'rq-c2' });
        assert.deepEqual(conferenceWriteFor('fake', { provider: 'meet', request: 1 }, null, 'rq'), { kind: 'meet', requestId: 'rq-c1' });
        assert.deepEqual(conferenceWriteFor('microsoft', { provider: 'teams', request: 1 }, null, 'rq'), { kind: 'teams' });
        assert.equal(conferenceWriteFor('microsoft', { provider: 'meet', request: 1 }, null, 'rq'), null);
        assert.equal(conferenceWriteFor('google', { provider: 'zoom', request: 1 }, null, 'rq'), null);
    });
    it('removing: a Meet is removed (conferenceData null); a Teams link never is', () => {
        assert.deepEqual(conferenceWriteFor('google', null, { provider: 'meet', request: 1 }, 'rq'), { kind: 'remove' });
        assert.equal(conferenceWriteFor('microsoft', null, { provider: 'teams', request: 1 }, 'rq'), null);
        assert.deepEqual(googleConferenceBody({ kind: 'remove' }), { conferenceData: null });
        assert.deepEqual(googleConferenceBody({ kind: 'meet', requestId: 'rq-c1' }), { conferenceData: { createRequest: { requestId: 'rq-c1', conferenceSolutionKey: { type: 'hangoutsMeet' } } } });
        assert.deepEqual(googleConferenceBody({ kind: 'teams' }), {});
        assert.deepEqual(graphConferenceBody({ kind: 'teams' }), { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' });
        assert.deepEqual(graphConferenceBody({ kind: 'remove' }), {});
    });
    it('join details are appended to the description once the link is ready', () => {
        const ready = { conferenceProvider: 'teams', conferenceState: 'ready', conferenceJoinUrl: 'https://teams.microsoft.com/l/1' };
        assert.equal(withJoinDetails('Agenda', ready), 'Agenda\nJoin Microsoft Teams meeting: https://teams.microsoft.com/l/1');
        assert.equal(withJoinDetails('', { ...ready, conferenceProvider: 'meet', conferenceJoinUrl: 'https://meet.google.com/a' }), 'Join with Google Meet: https://meet.google.com/a');
        assert.equal(withJoinDetails('Agenda', { ...ready, conferenceState: 'requested' }), 'Agenda');
    });
});

describe('applying an answer', () => {
    const meetReady = { provider: 'meet' as const, status: 'ready' as const, joinUrl: 'https://meet.google.com/a-b-c', urlRejected: false, conferenceId: 'a-b-c', requestId: 'rq-c1' };
    const sentMeet = { kind: 'meet' as const, requestId: 'rq-c1' };

    it('ready → ready with the URL; the same link again changes nothing', () => {
        const outcome = conferenceOutcome(requested(), meetReady, 'google', sentMeet);
        assert.deepEqual(outcome.columns, { conferenceState: 'ready', conferenceJoinUrl: 'https://meet.google.com/a-b-c', conferenceId: 'a-b-c', conferenceError: null });
        assert.equal(conferenceOutcome(requested({ conferenceState: 'ready', conferenceJoinUrl: meetReady.joinUrl, conferenceId: 'a-b-c' }), meetReady, 'google', null).columns, null);
    });
    it('pending (or no conference yet) after a request → poll; failure → failed conference_failed', () => {
        assert.deepEqual(conferenceOutcome(requested(), { ...meetReady, status: 'pending', joinUrl: null }, 'google', sentMeet), { columns: null, poll: true, adopted: false });
        assert.equal(conferenceOutcome(requested(), undefined, 'google', sentMeet).poll, true);
        assert.equal(conferenceOutcome(requested(), undefined, 'google', null).poll, false, 'a write that did not ask waits for nothing');
        const failed = conferenceOutcome(requested(), { ...meetReady, status: 'failed', joinUrl: null }, 'google', sentMeet);
        assert.equal(failed.columns?.conferenceState, 'failed');
        assert.equal(failed.columns?.conferenceError, conferenceErrorOf('conference_failed'));
    });
    it('an untrusted URL → failed join_url_rejected; a provider the calendar cannot make → failed provider_unavailable', () => {
        assert.equal(parseConferenceError(conferenceOutcome(requested(), { ...meetReady, joinUrl: null, urlRejected: true }, 'google', sentMeet).columns?.conferenceError)?.code, 'join_url_rejected');
        assert.equal(parseConferenceError(conferenceOutcome(requested({ conferenceProvider: 'teams' }), undefined, 'google', null).columns?.conferenceError)?.code, 'provider_unavailable');
    });
    it('inbound: a link made in the calendar is adopted read only, unless the CRM just removed it', () => {
        const none = requested({ conferenceProvider: null, conferenceState: null, conferenceRequest: 0 });
        const adopted = conferenceOutcome(none, meetReady, 'google', null);
        assert.equal(adopted.adopted, true);
        assert.equal(adopted.columns?.conferenceProvider, 'meet');
        assert.equal(adopted.columns?.conferenceState, 'ready');
        assert.equal(conferenceOutcome(none, meetReady, 'google', { kind: 'remove' }).columns, null);
        assert.equal(conferenceOutcome(none, meetReady, 'microsoft', null).columns, null, 'a Meet on an Outlook event is not ours to take');
    });
});

describe('small helpers', () => {
    it('meta switch, calendar → provider, and the unavailable reasons', () => {
        assert.equal(videoMeetingFromMeta({ videoMeeting: true }), true);
        assert.equal(videoMeetingFromMeta({ videoMeeting: 'true' }), false);
        assert.equal(videoMeetingFromMeta(null), false);
        assert.equal(videoProviderForCalendar('google'), 'meet');
        assert.equal(videoProviderForCalendar('microsoft'), 'teams');
        assert.equal(videoProviderForCalendar(null), null);
        assert.equal(videoUnavailableMessage('zoom', 'meet'), 'Zoom meetings are coming later.');
        assert.match(videoUnavailableMessage('teams', 'meet'), /creates Google Meet links, not Microsoft Teams/);
        assert.match(videoUnavailableMessage('meet', null), /needs the owner's company calendar/);
    });
});
