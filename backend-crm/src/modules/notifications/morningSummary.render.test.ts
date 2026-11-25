import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crmUrl, DETAILS_REMARKS_MAX, googleCalendarDetails, googleCalendarLink, recordPath } from './morningSummary.links.js';
import { escapeHtml, FOOTER_LINES, renderMorningSummary, summarySubject } from './morningSummary.render.js';
import { buildMorningSummary, type MorningSummary, type MorningSummaryInput } from './morningSummary.sections.js';

const IST = 'Asia/Kolkata';
const APP = 'https://crm.example.com';

const params = (url: string) => new URL(url).searchParams;

describe('escapeHtml', () => {
    it('escapes the five HTML-significant characters', () => {
        assert.equal(escapeHtml(`<script>alert("x") & 'y'</script>`), '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
        assert.equal(escapeHtml('plain'), 'plain');
    });
});

describe('CRM links', () => {
    it('joins the app URL and a record path', () => {
        assert.equal(crmUrl(`${APP}/`, '/leads/1'), `${APP}/leads/1`);
        assert.equal(crmUrl(APP, 'calendar'), `${APP}/calendar`);
        assert.equal(recordPath('contracts', 'a b/c'), '/contracts/a%20b%2Fc');
    });
});

describe('googleCalendarLink', () => {
    const timed = { title: 'Demo & review', start: new Date('2026-11-25T05:00:00.000Z'), end: new Date('2026-11-25T06:00:00.000Z'), allDay: false, timeZone: IST };

    it('builds the template URL with UTC times, encoded values and the time zone', () => {
        const url = googleCalendarLink({ ...timed, details: 'Line 1\n\nLine 2', location: 'Room #1' });
        assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=Demo%20%26%20review&dates='));
        const query = params(url);
        assert.deepEqual([...query.keys()], ['action', 'text', 'dates', 'details', 'location', 'ctz']);
        assert.equal(query.get('text'), 'Demo & review');
        assert.equal(query.get('dates'), '20261125T050000Z/20261125T060000Z');
        assert.equal(query.get('details'), 'Line 1\n\nLine 2');
        assert.equal(query.get('location'), 'Room #1');
        assert.equal(query.get('ctz'), IST);
    });

    it('gives an event without a (positive) end 30 minutes', () => {
        assert.equal(params(googleCalendarLink({ ...timed, end: null })).get('dates'), '20261125T050000Z/20261125T053000Z');
        assert.equal(params(googleCalendarLink({ ...timed, end: timed.start })).get('dates'), '20261125T050000Z/20261125T053000Z');
    });

    it('leaves out empty details and location', () => {
        assert.deepEqual([...params(googleCalendarLink({ ...timed, location: null })).keys()], ['action', 'text', 'dates', 'ctz']);
    });

    it('writes all-day events as days with the exclusive end day', () => {
        // 25–27 Nov in IST: stored from IST midnight of the 25th to IST midnight of the 28th.
        const allDay = { title: 'Expo', start: new Date('2026-11-24T18:30:00.000Z'), end: new Date('2026-11-27T18:30:00.000Z'), allDay: true, timeZone: IST };
        assert.equal(params(googleCalendarLink(allDay)).get('dates'), '20261125/20261128');
        assert.equal(params(googleCalendarLink({ ...allDay, end: null })).get('dates'), '20261125/20261126');
    });
});

describe('googleCalendarDetails', () => {
    it('lists the related record, the remarks (cut) and the CRM link', () => {
        const details = googleCalendarDetails({ related: 'LD-0012 Ramesh', remarks: `  ${'r'.repeat(700)}  `, crmLink: `${APP}/activities/a1` });
        const [related, remarks, crm] = details.split('\n\n');
        assert.equal(related, 'Related to: LD-0012 Ramesh');
        assert.equal(remarks.length, DETAILS_REMARKS_MAX);
        assert.ok(remarks.endsWith('…'));
        assert.equal(crm, `Open in Nandini CRM: ${APP}/activities/a1`);
        assert.equal(googleCalendarDetails({ remarks: null, crmLink: 'x' }), 'Open in Nandini CRM: x');
    });
});

const input = (overrides: Partial<MorningSummaryInput> = {}): MorningSummaryInput => ({
    now: new Date('2026-11-25T03:30:00.000Z'),
    timeZone: IST,
    appUrl: APP,
    recipient: { username: 'palak', fullName: 'Palak <Admin>' },
    today: {
        total: 1,
        rows: [
            {
                id: 'a1',
                subject: '<script>alert(1)</script> demo',
                followupType: 'Meeting',
                startAt: new Date('2026-11-25T05:00:00.000Z'),
                endAt: new Date('2026-11-25T06:00:00.000Z'),
                allDay: false,
                timeZone: IST,
                location: 'Office "B"',
                relatedTo: 'Ramesh',
                relatedCode: 'LD-0012',
                remarks: null,
            },
        ],
    },
    overdue: { total: 0, rows: [] },
    followupsToday: [],
    overdueFollowups: { leads: 0, opportunities: 0, rows: [] },
    contracts: [],
    ...overrides,
});

describe('renderMorningSummary', () => {
    it('escapes record text in the HTML and keeps it readable in the text part', () => {
        const email = renderMorningSummary(buildMorningSummary(input()));
        assert.equal(email.html.includes('<script>'), false);
        assert.ok(email.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; demo'));
        assert.ok(email.html.includes('Good morning, Palak &lt;Admin&gt;'));
        assert.ok(email.html.includes('Office &quot;B&quot;'));
        assert.ok(email.text.includes('<script>alert(1)</script> demo'));
    });

    it('links the button to the calendar and each row to its record', () => {
        const { html, text } = renderMorningSummary(buildMorningSummary(input()));
        assert.ok(html.includes(`<a href="${APP}/calendar"`));
        assert.ok(html.includes('>Open the CRM</a>'));
        assert.ok(html.includes(`href="${APP}/activities/a1"`));
        assert.ok(html.includes('Add to Google Calendar'));
        assert.ok(text.includes(`Open the CRM: ${APP}/calendar`));
        assert.ok(text.includes(`  ${APP}/activities/a1`));
        assert.ok(text.includes('Add to Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE'));
        for (const line of FOOTER_LINES) assert.ok(text.includes(line));
    });

    it('writes the subject from the day and headline, at most 200 characters', () => {
        const summary = buildMorningSummary(input());
        assert.equal(renderMorningSummary(summary).subject, 'Your CRM day, Wed 25 Nov: 1 activity today');
        const long: MorningSummary = { ...summary, headline: 'x'.repeat(300) };
        assert.equal(summarySubject(long).length, 200);
        assert.ok(summarySubject(long).endsWith('…'));
    });

    it('says so when nothing is due', () => {
        const email = renderMorningSummary(buildMorningSummary(input({ today: { total: 0, rows: [] } })));
        assert.equal(email.subject, 'Your CRM day, Wed 25 Nov: Nothing due today');
        assert.ok(email.text.includes('Nothing is due today.'));
        assert.ok(email.html.includes('Nothing is due today'));
    });
});
