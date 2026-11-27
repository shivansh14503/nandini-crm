import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BookingLink } from '../../generated/prisma/client.js';
import { buildIcs } from './bookingLink.ics.js';
import { assertLinkVideo, linkVideoOf, linkVideoToCheck, toBookingLinkDto, toLinkConfig } from './bookingLink.service.js';
import { createLinkSchema, updateLinkSchema } from './bookingLink.validator.js';

/**
 * Booking links' default video meeting (BookingLink.videoMeeting): request validation, the save-time rules (the type
 * offers video, the owner's company calendar creates that kind of link) and the stored value read defensively. The
 * booking side (copied onto the activity, confirmation, .ics) is in bookingLink.public.test.ts.
 */

const MEETING = { value: 'Meeting', label: 'Meeting', isActive: true, meta: { videoMeeting: true } };
const CALL = { value: 'Call', label: 'Call', isActive: true, meta: {} };
const config = { followupTypes: { options: [MEETING, CALL] } } as never;

/** The owner's live connection as `ownerConnectionOf` reads it: a calendar provider (or none), enabled, active user. */
function ownerDb(provider: 'google' | 'microsoft' | null) {
    return {
        calendarConnection: { findFirst: async () => (provider ? { id: 'conn-1', provider } : null) },
        integrationProvider: { findUnique: async () => ({ enabled: true }) },
        user: { findUnique: async () => ({ isActive: true, isGroupUser: false }) },
    } as never;
}

async function rejectsWith(promise: Promise<unknown>, status: number, code: string): Promise<void> {
    await assert.rejects(promise, (err: { statusCode?: number; code?: string; details?: { code?: string; errors?: { path: string[] }[] } }) => {
        assert.equal(err.statusCode, status);
        assert.equal(err.code ?? err.details?.code, code);
        return true;
    });
}

describe('booking links: video meeting validation', () => {
    it('takes meet | teams | none; refuses Zoom and anything else', () => {
        assert.equal(createLinkSchema.parse({ title: 'Demo', videoMeeting: 'meet' }).videoMeeting, 'meet');
        assert.equal(createLinkSchema.parse({ title: 'Demo', videoMeeting: '' }).videoMeeting, null);
        assert.equal(createLinkSchema.parse({ title: 'Demo', videoMeeting: null }).videoMeeting, null);
        assert.equal(createLinkSchema.parse({ title: 'Demo' }).videoMeeting, undefined);
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', videoMeeting: 'zoom' }), /Google Meet, Microsoft Teams or none/);
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', videoMeeting: 'skype' }));
        assert.deepEqual(updateLinkSchema.parse({ videoMeeting: 'teams' }), { videoMeeting: 'teams' });
        assert.equal(updateLinkSchema.parse({ title: 'x' }).videoMeeting, undefined, 'missing = keep');
    });

    it('a stored value is read defensively', () => {
        assert.equal(linkVideoOf('meet'), 'meet');
        assert.equal(linkVideoOf('zoom'), null);
        assert.equal(linkVideoOf(null), null);
    });
});

describe('booking links: video meeting save rules', () => {
    it('400 when the type does not offer video, 409 VIDEO_PROVIDER_NOT_CONNECTED when the owner’s calendar can’t make it', async () => {
        await assertLinkVideo('meet', 'Meeting', 'priya', config, ownerDb('google'));
        await assertLinkVideo('teams', 'Meeting', 'priya', config, ownerDb('microsoft'));
        await assertLinkVideo(null, 'Call', 'priya', config, ownerDb(null));
        await rejectsWith(assertLinkVideo('meet', 'Call', 'priya', config, ownerDb('google')), 400, 'VALIDATION_ERROR');
        await rejectsWith(assertLinkVideo('meet', 'Task', 'priya', config, ownerDb('google')), 400, 'VALIDATION_ERROR');
        await rejectsWith(assertLinkVideo('teams', 'Meeting', 'priya', config, ownerDb('google')), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
        await rejectsWith(assertLinkVideo('meet', 'Meeting', 'priya', config, ownerDb(null)), 409, 'VIDEO_PROVIDER_NOT_CONNECTED');
    });

    it('an update checks a new value or a new type only (re-saving what is stored passes)', () => {
        const stored = { videoMeeting: 'meet', followupType: 'Meeting' };
        assert.equal(linkVideoToCheck({}, stored), null);
        assert.equal(linkVideoToCheck({ videoMeeting: 'meet' }, stored), null, 'the calendar going away does not block other edits');
        assert.equal(linkVideoToCheck({ videoMeeting: null }, stored), null, 'clearing always works');
        assert.deepEqual(linkVideoToCheck({ videoMeeting: 'teams' }, stored), { video: 'teams', followupType: 'Meeting' });
        assert.deepEqual(linkVideoToCheck({ followupType: 'Call' }, stored), { video: 'meet', followupType: 'Call' });
        assert.equal(linkVideoToCheck({ followupType: 'Call', videoMeeting: null }, stored), null);
        assert.deepEqual(linkVideoToCheck({ videoMeeting: 'meet' }, { videoMeeting: null, followupType: 'Meeting' }), { video: 'meet', followupType: 'Meeting' });
    });
});

describe('booking links: video meeting in the DTO and the .ics', () => {
    const row = {
        id: 'link-1',
        slug: 'priya-demo-abcdefgh',
        ownerUsername: 'priya',
        title: 'Demo',
        followupType: 'Meeting',
        durationsJson: '[30]',
        slotStepMinutes: 30,
        location: null,
        videoMeeting: 'teams',
        note: null,
        availabilityJson: '{"1":[{"start":"10:00","end":"12:00"}]}',
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minNoticeMinutes: 60,
        horizonDays: 14,
        maxPerDay: null,
        reminder: null,
        askPhone: false,
        askCompany: false,
        relatedModule: null,
        relatedId: null,
        isActive: true,
        createdBy: 'priya',
        updatedBy: null,
        createdAt: new Date('2026-11-26T10:00:00Z'),
        updatedAt: new Date('2026-11-26T10:00:00Z'),
    } as BookingLink;

    it('the management DTO and the link config carry it', () => {
        assert.equal(toBookingLinkDto(row, { ownerName: 'Priya', ownerCalendar: 'synced' }).videoMeeting, 'teams');
        assert.equal(toLinkConfig(row).videoMeeting, 'teams');
        assert.equal(toLinkConfig({ ...row, videoMeeting: 'zoom' }).videoMeeting, null);
    });

    it('.ics: a ready link goes in URL (not text-escaped)', () => {
        const ics = buildIcs({
            uid: 'u',
            start: new Date('2026-11-30T05:30:00Z'),
            end: new Date('2026-11-30T06:00:00Z'),
            summary: 'Demo',
            description: 'Google Meet: https://meet.google.com/abc-defg-hij',
            url: 'https://meet.google.com/abc-defg-hij',
            stamp: new Date('2026-11-26T10:00:00Z'),
        });
        assert.match(ics, /\r\nURL:https:\/\/meet\.google\.com\/abc-defg-hij\r\n/);
        assert.ok(!buildIcs({ uid: 'u', start: new Date(0), end: new Date(60_000), summary: 'x', stamp: new Date(0) }).includes('URL:'));
    });
});
