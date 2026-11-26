import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookingAccessOf, roleMayOwnLinks } from './bookingLink.access.js';
import { buildIcs, escapeIcsText, foldIcsLine } from './bookingLink.ics.js';
import { BookingRateLimitError, chargeLink, localHit, resetLocalBookingLimits } from './bookingLink.rateLimit.js';
import { newSlug, parseAvailability, parseDurations, slugPart } from './bookingLink.service.js';
import { bookingSettingsSchema, readBookingSettings } from './bookingLink.settings.js';
import { availabilitySchema, bookBodySchema, createLinkSchema, SLUG_PATTERN, slotsQuerySchema, updateLinkSchema } from './bookingLink.validator.js';
import { bookingRemarks } from './bookingLink.public.js';

describe('booking links: settings and access', () => {
    it('reads the defaults (off, everyone) from nothing or junk', () => {
        assert.deepEqual(readBookingSettings(undefined), { enabled: false, whoCanCreate: 'everyone' });
        assert.deepEqual(readBookingSettings({ enabled: 'yes', whoCanCreate: 'boss' }), { enabled: false, whoCanCreate: 'everyone' });
        assert.deepEqual(readBookingSettings({ enabled: true, whoCanCreate: 'admins' }), { enabled: true, whoCanCreate: 'admins' });
        assert.deepEqual(bookingSettingsSchema.parse({}), { enabled: false, whoCanCreate: 'everyone' });
        assert.throws(() => bookingSettingsSchema.parse({ enabled: true, extra: 1 }));
    });

    it('who may own links', () => {
        const exec = { role: 'Sales Executive' };
        const manager = { role: 'Sales Manager' };
        const admin = { role: 'Admin' };
        assert.equal(roleMayOwnLinks(exec, 'everyone'), true);
        assert.equal(roleMayOwnLinks(exec, 'managers'), false);
        assert.equal(roleMayOwnLinks(manager, 'managers'), true);
        assert.equal(roleMayOwnLinks(manager, 'admins'), false);
        assert.equal(roleMayOwnLinks(admin, 'admins'), true);
        assert.deepEqual(bookingAccessOf(exec, { enabled: false, whoCanCreate: 'everyone' }), { enabled: false, canCreate: false, isAdmin: false, whoCanCreate: 'everyone', ownsLinks: false });
        assert.equal(bookingAccessOf(exec, { enabled: false, whoCanCreate: 'admins' }, true).ownsLinks, true);
        assert.equal(bookingAccessOf(admin, { enabled: true, whoCanCreate: 'admins' }).isAdmin, true);
    });
});

describe('booking links: slugs', () => {
    it('makes readable, unguessable slugs that pass the public pattern', () => {
        let i = 0;
        const slug = newSlug('Priya Sharma', 'Product demo (30 min) — Café', () => i++ % 32);
        assert.equal(slug, 'priya-product-demo-30-min-cafe-abcdefgh');
        assert.match(slug, SLUG_PATTERN);
        assert.ok(newSlug('', '!!!').length === 8);
        assert.ok(newSlug('A'.repeat(80), 'B'.repeat(80)).length <= 60);
        assert.equal(slugPart('--Hello  World--', 30), 'hello-world');
    });

    it('rejects anything else as a slug', () => {
        for (const bad of ['', 'ABC', '-abc', 'abc-', 'a/b', 'a'.repeat(61), '../x']) assert.equal(SLUG_PATTERN.test(bad), false, bad);
    });

    it('parses stored JSON defensively', () => {
        assert.deepEqual(parseDurations('[30,60]'), [30, 60]);
        assert.deepEqual(parseDurations('nope'), [30]);
        assert.deepEqual(parseAvailability('{"1":[{"start":"09:00","end":"10:00"}]}'), { '1': [{ start: '09:00', end: '10:00' }] });
        assert.deepEqual(parseAvailability('{"1":[{"start":"10:00","end":"09:00"}]}'), {});
    });
});

describe('booking links: validation', () => {
    it('availability: sorted, no overlaps, at least one range', () => {
        assert.deepEqual(availabilitySchema.parse({ '2': [{ start: '14:00', end: '18:00' }, { start: '09:00', end: '12:00' }] }), {
            '2': [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
        });
        assert.throws(() => availabilitySchema.parse({ '2': [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }] }));
        assert.throws(() => availabilitySchema.parse({}));
        assert.throws(() => availabilitySchema.parse({ '8': [{ start: '09:00', end: '10:00' }] }));
        assert.throws(() => availabilitySchema.parse({ '1': [{ start: '09:00', end: '10:00', x: 1 }] }));
        assert.deepEqual(availabilitySchema.parse({ '7': [{ start: '20:00', end: '24:00' }] }), { '7': [{ start: '20:00', end: '24:00' }] });
    });

    it('link bodies are strict and bounded', () => {
        assert.equal(createLinkSchema.parse({ title: 'Demo' }).title, 'Demo');
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', ownerUsername: 'x', hacker: true }));
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', durations: [30, 30] }));
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', durations: [7] }));
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', slotStepMinutes: 20 }));
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', relatedModule: 'leads' }), 'record type without a record');
        assert.throws(() => updateLinkSchema.parse({}));
        assert.throws(() => updateLinkSchema.parse({ ownerUsername: 'x' }));
        assert.deepEqual(updateLinkSchema.parse({ isActive: false }), { isActive: false });
        assert.throws(() => createLinkSchema.parse({ title: 'Demo', horizonDays: 61 }));
    });

    it('public bodies: strict, email lower-cased, phone E.164, honeypot accepted as a field', () => {
        const body = bookBodySchema.parse({ token: 'v1.abc.30.def.ghijklmnopqrstuvwxyz12', name: ' Asha ', email: 'Asha@Example.COM', phone: '98112 34567', website: '' });
        assert.equal(body.email, 'asha@example.com');
        assert.equal(body.phone, '+919811234567');
        assert.equal(body.name, 'Asha');
        assert.throws(() => bookBodySchema.parse({ token: 'v1.abc.30.def.ghijklmnopqrstuvwxyz12', name: 'A', email: 'a@b.co', admin: true }));
        assert.throws(() => bookBodySchema.parse({ token: 'v1.abc.30.def.ghijklmnopqrstuvwxyz12', name: '<script>', email: 'a@b.co' }));
        assert.throws(() => bookBodySchema.parse({ token: 'v1.abc.30.def.ghijklmnopqrstuvwxyz12', name: 'A', email: 'not-an-email' }));
        assert.deepEqual(slotsQuerySchema.parse({ from: '2026-12-01', days: '7', duration: '30' }), { from: '2026-12-01', days: 7, duration: 30 });
        assert.throws(() => slotsQuerySchema.parse({ days: '100' }));
        assert.throws(() => slotsQuerySchema.parse({ users: 'priya' }));
    });

    it('remarks hold where it came from and what the visitor said', () => {
        assert.equal(
            bookingRemarks({ title: 'Demo', slug: 'priya-demo-abc' }, { phone: '+919811234567', company: 'Acme', message: 'About pricing' }),
            'Booked online through "Demo" (/book/priya-demo-abc).\nPhone: +919811234567\nCompany: Acme\nMessage: About pricing',
        );
        assert.ok(bookingRemarks({ title: 'Demo', slug: 's' }, { message: 'x'.repeat(3000) }).length <= 2000);
    });
});

describe('booking links: .ics', () => {
    it('escapes text and folds long lines at 75 octets', () => {
        assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
        const folded = foldIcsLine(`SUMMARY:${'é'.repeat(60)}`);
        for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
        assert.equal(folded.split('\r\n ').join(''), `SUMMARY:${'é'.repeat(60)}`);
    });

    it('builds a CRLF VEVENT in UTC', () => {
        const ics = buildIcs({
            uid: 'booking-1@nandini-crm',
            start: new Date('2026-11-30T05:00:00.000Z'),
            end: new Date('2026-11-30T05:30:00.000Z'),
            summary: 'Demo with Priya',
            location: 'Office, Pune',
            description: null,
            stamp: new Date('2026-11-26T10:00:00.000Z'),
        });
        assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
        assert.ok(ics.includes('\r\nDTSTART:20261130T050000Z\r\n'));
        assert.ok(ics.includes('\r\nDTEND:20261130T053000Z\r\n'));
        assert.ok(ics.includes('\r\nLOCATION:Office\\, Pune\r\n'));
        assert.ok(!ics.includes('DESCRIPTION'));
        assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
    });
});

describe('booking links: in-process rate limit', () => {
    it('counts per key and window, then resets', () => {
        const t = 1_000_000;
        for (let i = 0; i < 3; i += 1) assert.equal(localHit('k', 3, 60, t).allowed, true);
        const refused = localHit('k', 3, 60, t + 1000);
        assert.equal(refused.allowed, false);
        assert.equal(refused.retryAfterSeconds, 59);
        assert.equal(localHit('other', 3, 60, t).allowed, true);
        assert.equal(localHit('k', 3, 60, t + 61_000).allowed, true);
    });

    it('per-link charges: 30 booking attempts an hour per link (in process without Redis), then 429 with a retry time', async () => {
        resetLocalBookingLimits();
        for (let i = 0; i < 30; i += 1) await chargeLink('book', 'link-x');
        await assert.rejects(chargeLink('book', 'link-x'), (err: unknown) => {
            assert.ok(err instanceof BookingRateLimitError);
            assert.equal(err.statusCode, 429);
            assert.equal(err.code, 'RATE_LIMITED');
            assert.ok(err.retryAfterSeconds > 0);
            return true;
        });
        await chargeLink('book', 'link-y');
        await chargeLink('slots', 'link-x');
        resetLocalBookingLimits();
    });
});
