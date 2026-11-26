import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DISPLAY_FORMATS, type DisplayFormats } from '../company-formats/core/displayFormats.js';
import { summarySubject } from './morningSummary.render.js';
import {
    buildMorningSummary,
    SUMMARY_LIST_MAX,
    summaryHeadline,
    typeBadge,
    type MorningSummaryInput,
    type SummaryActivityRow,
    type SummaryContractRow,
    type SummaryFollowup,
} from './morningSummary.sections.js';

const IST = 'Asia/Kolkata';
const APP = 'https://crm.example.com';
// Wednesday 25 Nov 2026, 09:00 IST.
const now = new Date('2026-11-25T03:30:00.000Z');

const activity = (id: string, overrides: Partial<SummaryActivityRow> = {}): SummaryActivityRow => ({
    id,
    subject: `Activity ${id}`,
    followupType: 'Meeting',
    startAt: new Date('2026-11-25T05:00:00.000Z'),
    endAt: new Date('2026-11-25T06:00:00.000Z'),
    allDay: false,
    timeZone: IST,
    location: null,
    relatedTo: null,
    relatedCode: null,
    remarks: null,
    ...overrides,
});

const followup = (recordId: string, overrides: Partial<SummaryFollowup> = {}): SummaryFollowup => ({
    module: 'leads',
    recordId,
    title: `Follow-up ${recordId}`,
    followupType: 'Call',
    start: '2026-11-25T05:00:00.000Z',
    allDay: false,
    startDay: null,
    relatedTo: `LD-${recordId}`,
    ...overrides,
});

const contract = (id: string, overrides: Partial<SummaryContractRow> = {}): SummaryContractRow => ({
    id,
    contractNumber: `CON-${id}`,
    contractTitle: `Contract ${id}`,
    organizationName: 'ACME LTD',
    renewalReminderDate: null,
    endDate: null,
    ...overrides,
});

const input = (overrides: Partial<MorningSummaryInput> = {}): MorningSummaryInput => ({
    now,
    timeZone: IST,
    appUrl: APP,
    recipient: { username: 'palak', fullName: 'Palak Shah' },
    typeIcons: { Meeting: 'meeting', Call: 'call' },
    today: { total: 0, rows: [] },
    overdue: { total: 0, rows: [] },
    followupsToday: { leads: 0, opportunities: 0, rows: [] },
    overdueFollowups: { leads: 0, opportunities: 0, rows: [] },
    contracts: { total: 0, rows: [] },
    ...overrides,
});

const section = (summary: ReturnType<typeof buildMorningSummary>, key: string) => {
    const found = summary.sections.find((item) => item.key === key);
    assert.ok(found, `section ${key}`);
    return found;
};

describe('typeBadge', () => {
    it('uses the emoji of the type option icon', () => {
        assert.equal(typeBadge('Meeting', { Meeting: 'meeting' }), '👥 Meeting');
        assert.equal(typeBadge('Call', { Call: 'call' }), '📞 Call');
        assert.equal(typeBadge('Task'), '✅ Task');
        assert.equal(typeBadge('Site visit'), '🗓️ Site visit');
        assert.equal(typeBadge(null), '');
    });
});

describe("today's schedule", () => {
    const rows = [
        activity('timed', { subject: 'Demo', relatedTo: 'Ramesh', relatedCode: 'LD-0012', location: 'Office' }),
        activity('task', { subject: 'Send quote', followupType: 'Task', startAt: new Date('2026-11-25T04:00:00.000Z'), endAt: null }),
        activity('allday', { subject: 'Expo', followupType: 'Visit', allDay: true, startAt: new Date('2026-11-24T18:30:00.000Z'), endAt: new Date('2026-11-25T18:30:00.000Z') }),
        activity('multiday', { subject: 'Training', allDay: true, startAt: new Date('2026-11-24T18:30:00.000Z'), endAt: new Date('2026-11-27T18:30:00.000Z') }),
        activity('carryover', { subject: 'Workshop', startAt: new Date('2026-11-24T12:00:00.000Z'), endAt: new Date('2026-11-25T06:30:00.000Z') }),
    ];
    const summary = buildMorningSummary(input({ today: { total: rows.length, rows } }));
    const today = section(summary, 'today');

    it('lists all-day items first, then by start time', () => {
        assert.deepEqual(
            today.items.map((item) => [item.when, item.title]),
            [
                ['All day', 'Expo'],
                ['All day (until Fri 27 Nov)', 'Training'],
                ['Until 12:00 PM', 'Workshop'],
                ['9:30 AM', 'Send quote'],
                ['10:30 AM – 11:30 AM', 'Demo'],
            ],
        );
    });

    it('shows the related record, location, type badge and record link', () => {
        const demo = today.items.find((item) => item.title === 'Demo');
        assert.equal(demo?.detail, 'LD-0012 Ramesh · Office');
        assert.equal(demo?.badge, '👥 Meeting');
        assert.equal(demo?.href, `${APP}/activities/timed`);
    });

    it('adds a Google Calendar link to everything but Tasks', () => {
        for (const item of today.items) assert.equal(Boolean(item.googleCalendarUrl), item.title !== 'Send quote', item.title);
        const demo = today.items.find((item) => item.title === 'Demo');
        const details = new URL(demo?.googleCalendarUrl ?? '').searchParams.get('details');
        assert.equal(details, `Related to: LD-0012 Ramesh\n\nOpen in Nandini CRM: ${APP}/activities/timed`);
    });

    it("links the rest of a capped list to that day's calendar agenda", () => {
        const capped = section(buildMorningSummary(input({ today: { total: 60, rows } })), 'today');
        assert.equal(capped.total, 60);
        assert.deepEqual(capped.more, [{ label: 'and 55 more', href: `${APP}/calendar?view=agenda&date=2026-11-25` }]);
    });
});

describe('overdue activities', () => {
    it(`lists ${SUMMARY_LIST_MAX} and links the rest to the user's activities`, () => {
        const rows = Array.from({ length: 12 }, (_, n) => activity(`o${n}`, { startAt: new Date('2026-11-23T05:00:00.000Z'), endAt: new Date('2026-11-23T06:00:00.000Z') }));
        const overdue = section(buildMorningSummary(input({ overdue: { total: 13, rows } })), 'overdueActivities');
        assert.equal(overdue.items.length, SUMMARY_LIST_MAX);
        assert.equal(overdue.total, 13);
        assert.equal(overdue.items[0].when, 'Mon 23 Nov, 10:30 AM');
        assert.equal(overdue.items[0].googleCalendarUrl, undefined);
        assert.deepEqual(overdue.more, [{ label: 'and 3 more', href: `${APP}/activities?mine=1` }]);
    });
});

describe('follow-ups', () => {
    it('lists timed follow-ups by time and the ones without a time last', () => {
        const rows = [
            followup('anytime', { allDay: true, start: '2026-11-24T18:30:00.000Z', startDay: '2026-11-25' }),
            followup('late', { start: '2026-11-25T10:00:00.000Z' }),
            followup('early', { module: 'opportunities', start: '2026-11-25T04:00:00.000Z', relatedTo: 'OP-0003' }),
        ];
        const today = section(buildMorningSummary(input({ followupsToday: { leads: 2, opportunities: 1, rows } })), 'followupsToday');
        assert.deepEqual(
            today.items.map((item) => [item.when, item.title, item.detail, item.href]),
            [
                ['9:30 AM', 'Follow-up early', 'Opportunity OP-0003', `${APP}/opportunities/early`],
                ['3:30 PM', 'Follow-up late', 'Lead LD-late', `${APP}/leads/late`],
                ['Any time', 'Follow-up anytime', 'Lead LD-anytime', `${APP}/leads/anytime`],
            ],
        );
        assert.equal(today.items[0].badge, '📞 Call');
        assert.equal(today.total, 3);
        assert.deepEqual(today.more, []);
    });

    it('counts follow-ups due today beyond the listed ones and links the rest to that day’s agenda', () => {
        const rows = [followup('l1'), followup('l2'), followup('o1', { module: 'opportunities' })];
        const summary = buildMorningSummary(input({ followupsToday: { leads: 70, opportunities: 1, rows } }));
        const today = section(summary, 'followupsToday');
        assert.equal(today.total, 71);
        assert.equal(today.items.length, 3);
        // The lead / opportunity lists can't be filtered to "due today, mine" by URL; the day's agenda shows exactly those.
        assert.deepEqual(today.more, [{ label: 'and 68 more leads', href: `${APP}/calendar?view=agenda&date=2026-11-25` }]);
        assert.equal(summary.counts.followupsToday, 71);
        assert.equal(summary.headline, '71 follow-ups due');

        const both = section(buildMorningSummary(input({ followupsToday: { leads: 3, opportunities: 2, rows } })), 'followupsToday');
        assert.deepEqual(both.more, [
            { label: 'and 1 more lead', href: `${APP}/calendar?view=agenda&date=2026-11-25` },
            { label: 'and 1 more opportunity', href: `${APP}/calendar?view=agenda&date=2026-11-25` },
        ]);
    });

    it('shows how overdue each one is and links the rest per module', () => {
        const rows = [
            ...Array.from({ length: 9 }, (_, n) => followup(`l${n}`, { allDay: true, start: '2026-11-22T18:30:00.000Z', startDay: '2026-11-23' })),
            followup('o1', { module: 'opportunities', start: '2026-11-24T05:00:00.000Z' }),
        ];
        const overdue = section(buildMorningSummary(input({ overdueFollowups: { leads: 12, opportunities: 1, rows } })), 'overdueFollowups');
        assert.equal(overdue.total, 13);
        assert.equal(overdue.items[0].when, 'Due Mon 23 Nov');
        assert.equal(overdue.items[0].detail, 'Lead LD-l0 · 2 days overdue');
        assert.equal(overdue.items[9].detail, 'Opportunity LD-o1 · 1 day overdue');
        assert.deepEqual(overdue.more, [{ label: 'and 3 more leads', href: `${APP}/leads` }]);

        const one = section(buildMorningSummary(input({ overdueFollowups: { leads: 0, opportunities: 2, rows: [rows[9]] } })), 'overdueFollowups');
        assert.deepEqual(one.more, [{ label: 'and 1 more opportunity', href: `${APP}/opportunities` }]);
    });
});

describe('contract renewals', () => {
    it('lists renewal reminders of today first, then contracts by end date, each once', () => {
        const rows = [
            contract('0008', { endDate: new Date('2026-12-01T00:00:00.000Z') }),
            contract('0007', { renewalReminderDate: new Date('2026-11-25T10:00:00.000Z'), endDate: new Date('2026-12-18T00:00:00.000Z') }),
            contract('0009', { renewalReminderDate: new Date('2026-11-25T09:00:00.000Z') }),
        ];
        const contracts = section(buildMorningSummary(input({ contracts: { total: 3, rows: [...rows, rows[1]] } })), 'contracts');
        assert.deepEqual(
            contracts.items.map((item) => [item.when, item.title, item.detail, item.href]),
            [
                ['Renewal, 9:00 AM', 'Contract 0009 · ACME LTD', 'CON-0009', `${APP}/contracts/0009`],
                ['Renewal, 10:00 AM', 'Contract 0007 · ACME LTD', 'CON-0007 · ends Fri 18 Dec (in 23 days)', `${APP}/contracts/0007`],
                ['Ends Tue 1 Dec', 'Contract 0008 · ACME LTD', 'CON-0008 · in 6 days', `${APP}/contracts/0008`],
            ],
        );
        assert.equal(contracts.total, 3);
        assert.deepEqual(contracts.more, []);
    });

    it('counts contracts beyond the listed ones', () => {
        const rows = [contract('0008', { endDate: new Date('2026-12-01T00:00:00.000Z') })];
        const summary = buildMorningSummary(input({ contracts: { total: 52, rows } }));
        const contracts = section(summary, 'contracts');
        assert.equal(contracts.total, 52);
        // The listed rows end soonest; the rest are on the contracts list's "Expiring in 30 Days" pill.
        assert.deepEqual(contracts.more, [{ label: 'and 51 more', href: `${APP}/contracts?view=expiring_soon` }]);
        assert.equal(summary.counts.contracts, 52);
    });
});

describe('summary', () => {
    it('counts every section and writes the headline', () => {
        const summary = buildMorningSummary(
            input({
                today: { total: 2, rows: [activity('a1'), activity('a2')] },
                overdue: { total: 3, rows: [activity('o1', { startAt: new Date('2026-11-20T05:00:00.000Z'), endAt: null })] },
                followupsToday: { leads: 1, opportunities: 0, rows: [followup('f1')] },
                overdueFollowups: { leads: 1, opportunities: 0, rows: [followup('f2', { start: '2026-11-20T05:00:00.000Z' })] },
                contracts: { total: 1, rows: [contract('c1', { endDate: new Date('2026-12-01T00:00:00.000Z') })] },
            }),
        );
        assert.deepEqual(summary.counts, { todayActivities: 2, overdueActivities: 3, followupsToday: 1, overdueFollowups: 1, contracts: 1 });
        assert.equal(summary.headline, '2 activities today · 1 follow-up due · 4 overdue · 1 contract to renew');
        assert.deepEqual(
            summary.sections.map((item) => item.key),
            ['today', 'overdueActivities', 'followupsToday', 'overdueFollowups', 'contracts'],
        );
        assert.equal(summary.day, '2026-11-25');
        assert.equal(summary.dayLabel, 'Wednesday, 25 November 2026');
        assert.equal(summary.recipientName, 'Palak Shah');
        assert.equal(summary.calendarUrl, `${APP}/calendar`);
        assert.equal(summary.empty, false);
    });

    it('is empty with nothing due, and falls back to the username', () => {
        const summary = buildMorningSummary(input({ recipient: { username: 'palak', fullName: ' ' } }));
        assert.equal(summary.empty, true);
        assert.deepEqual(summary.sections, []);
        assert.equal(summary.headline, 'Nothing due today');
        assert.equal(summary.recipientName, 'palak');
        assert.equal(summaryHeadline({ todayActivities: 1, overdueActivities: 0, followupsToday: 2, overdueFollowups: 0, contracts: 0 }), '1 activity today · 2 follow-ups due');
    });
});

describe('saved company formats', () => {
    const us: DisplayFormats = { ...DEFAULT_DISPLAY_FORMATS, customized: true, dateFormat: 'MM/DD/YYYY', timeFormat: '24h' };
    const rows = {
        today: { total: 2, rows: [activity('timed'), activity('multiday', { allDay: true, startAt: new Date('2026-11-24T18:30:00.000Z'), endAt: new Date('2026-11-27T18:30:00.000Z') })] },
        overdue: { total: 1, rows: [activity('o1', { startAt: new Date('2026-11-20T09:00:00.000Z'), endAt: null })] },
        followupsToday: { leads: 1, opportunities: 0, rows: [followup('f1', { start: '2026-11-25T09:00:00.000Z' })] },
        overdueFollowups: { leads: 1, opportunities: 0, rows: [followup('f2', { start: '2026-11-20T05:00:00.000Z' })] },
        contracts: {
            total: 2,
            rows: [
                contract('0007', { renewalReminderDate: new Date('2026-11-25T15:00:00.000Z'), endDate: new Date('2026-12-18T00:00:00.000Z') }),
                contract('0008', { endDate: new Date('2026-12-01T00:00:00.000Z') }),
            ],
        },
    };
    const whens = (summary: ReturnType<typeof buildMorningSummary>) => summary.sections.flatMap((item) => item.items.map((row) => [row.when, row.detail]));

    it('keeps the email’s own style without formats or with the defaults', () => {
        const before = buildMorningSummary(input(rows));
        assert.deepEqual(whens(buildMorningSummary(input({ ...rows, formats: DEFAULT_DISPLAY_FORMATS }))), whens(before));
        assert.deepEqual(before.formats, DEFAULT_DISPLAY_FORMATS);
        assert.equal(summarySubject(before), 'Your CRM day, Wed 25 Nov: 2 activities today · 1 follow-up due · 2 overdue · 2 contracts to renew');
    });

    it('writes every time, day label, heading and the subject in the saved formats', () => {
        const summary = buildMorningSummary(input({ ...rows, formats: us }));
        assert.deepEqual(whens(summary), [
            ['All day (until Fri Nov 27)', ''],
            ['10:30 – 11:30', ''],
            ['Fri Nov 20, 14:30', ''],
            ['14:30', 'Lead LD-f1'],
            ['Due Fri Nov 20', 'Lead LD-f2 · 5 days overdue'],
            ['Renewal, 15:00', 'CON-0007 · ends Fri Dec 18 (in 23 days)'],
            ['Ends Tue Dec 1', 'CON-0008 · in 6 days'],
        ]);
        assert.equal(summary.dayLabel, 'Wednesday, November 25, 2026');
        assert.equal(summarySubject(summary), 'Your CRM day, Wed Nov 25: 2 activities today · 1 follow-up due · 2 overdue · 2 contracts to renew');
    });
});
