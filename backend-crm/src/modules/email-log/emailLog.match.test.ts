import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthUser } from '../../types/user.types.js';
import { RECIPIENTS_KEPT } from './emailLog.constants.js';
import {
    boundRecipients,
    cleanSnippet,
    cleanSubject,
    directionOf,
    externalAddresses,
    hasPrivateMarker,
    isAddressed,
    isAutomatedHeaders,
    messageIdHash,
    normalizeEmail,
    parseAddressList,
    planMessage,
    preFilter,
} from './emailLog.match.js';
import { seesAllRecordEmails } from './emailLog.service.js';
import { EMAIL_LOGGING_DEFAULTS, effectiveMode, emailLoggingSettingsPatchSchema, emailLoggingSettingsSchema, loggingStartOf, readEmailLoggingSettings, stampSettings } from './emailLog.settings.js';
import { message } from './testing/mailMessage.js';

const DOMAINS = ['nandiniinfosys.com'];


describe('email logging: addresses', () => {
    it('normalises addresses and refuses non-addresses', () => {
        assert.equal(normalizeEmail('  <Ravi@Customer.IN> '), 'ravi@customer.in');
        assert.equal(normalizeEmail('mailto:a@b.co'), 'a@b.co');
        assert.equal(normalizeEmail('not an address'), null);
        assert.equal(normalizeEmail('a@b'), null);
        assert.equal(normalizeEmail(null), null);
    });

    it('parses address headers with quoted commas, comments and groups', () => {
        assert.deepEqual(parseAddressList('"Doe, Jane" <Jane@X.com>, bob@y.com (Bob), Team: c@z.in, d@z.in;'), [
            { email: 'jane@x.com', name: 'Doe, Jane' },
            { email: 'bob@y.com' },
            { email: 'c@z.in' },
            { email: 'd@z.in' },
        ]);
        assert.deepEqual(parseAddressList('undisclosed-recipients:;'), []);
        assert.deepEqual(parseAddressList(''), []);
    });

    it('external addresses ignore company domains; direction follows the sender', () => {
        const msg = message({ cc: [{ email: 'boss@nandiniinfosys.com' }, { email: 'cfo@customer.in' }] });
        assert.deepEqual(externalAddresses(msg, DOMAINS), ['ravi@customer.in', 'cfo@customer.in']);
        assert.equal(directionOf(msg.from, DOMAINS), 'in');
        assert.equal(directionOf({ email: 'asha@nandiniinfosys.com' }, DOMAINS), 'out');
        assert.equal(directionOf(null, DOMAINS), 'in');
    });
});

describe('email logging: filters', () => {
    it('reads automation headers', () => {
        assert.equal(isAutomatedHeaders({ 'list-unsubscribe': '<mailto:u@x.com>' }), true);
        assert.equal(isAutomatedHeaders({ 'auto-submitted': 'auto-replied' }), true);
        assert.equal(isAutomatedHeaders({ 'auto-submitted': 'no' }), false);
        assert.equal(isAutomatedHeaders({ precedence: 'Bulk' }), true);
        assert.equal(isAutomatedHeaders({ subject: 'hi' }), false);
    });

    it('private markers are case-insensitive', () => {
        assert.equal(hasPrivateMarker(['Work', 'PRIVATE']), true);
        assert.equal(hasPrivateMarker(['No  CRM']), true);
        assert.equal(hasPrivateMarker(['Customers']), false);
    });

    it('pre-filter: drafts, excluded folders, private, internal-only', () => {
        assert.equal(preFilter(message({ isDraft: true }), DOMAINS), 'draft');
        assert.equal(preFilter(message({ excluded: true }), DOMAINS), 'excluded_folder');
        assert.equal(preFilter(message({ privateMarked: true }), DOMAINS), 'private');
        assert.equal(preFilter(message({ from: { email: 'a@nandiniinfosys.com' }, to: [{ email: 'b@nandiniinfosys.com' }] }), DOMAINS), 'internal');
        assert.equal(preFilter(message({ from: null, to: [], cc: [] }), DOMAINS), 'no_participants');
        assert.equal(preFilter(message(), DOMAINS), null);
    });
});

describe('email logging: stored values', () => {
    it('snippets are plain text, decoded and bounded', () => {
        assert.equal(cleanSnippet('Hi &amp; welcome&#39;s <b>team</b>\u0000 &#x263A;'), "Hi & welcome's team ☺");
        assert.equal(cleanSnippet('   '), null);
        const long = cleanSnippet('x'.repeat(900))!;
        assert.equal(long.length, 500);
        assert.ok(long.endsWith('…'));
    });

    it('subjects are bounded and never empty', () => {
        assert.equal(cleanSubject(''), '(no subject)');
        assert.equal(cleanSubject('a\r\nb'), 'a b');
        assert.equal(cleanSubject('s'.repeat(400)).length, 300);
    });

    it('recipients are capped at 25 and the rest counted', () => {
        const list = Array.from({ length: 30 }, (_, i) => ({ email: `p${i}@x.com`, name: `Person ${i}` }));
        const bounded = boundRecipients(list);
        assert.equal(bounded.kept.length, RECIPIENTS_KEPT);
        assert.equal(bounded.more, 5);
        assert.ok(bounded.json.length <= 4000);
        const huge = Array.from({ length: 25 }, (_, i) => ({ email: `${'a'.repeat(60)}${i}@x.com`, name: 'N'.repeat(180) }));
        const fitted = boundRecipients(huge);
        assert.ok(fitted.json.length <= 4000);
        assert.equal(fitted.kept.length + fitted.more, 25);
    });

    it('Message-ID hashes are stable, include the sender and are null without an id', () => {
        assert.equal(messageIdHash(' <a@b> ', 'Ravi@Customer.in'), messageIdHash('<a@b>', 'ravi@customer.in'));
        assert.equal(messageIdHash('<a@b>', 'ravi@customer.in')?.length, 64);
        assert.notEqual(messageIdHash('<a@b>', 'ravi@customer.in'), messageIdHash('<a@b>', 'other@customer.in'));
        assert.equal(messageIdHash('', 'ravi@customer.in'), null);
        assert.equal(messageIdHash(null, 'ravi@customer.in'), null);
    });

    it('a mailbox is addressed only as sender, To or Cc (not Bcc / a list)', () => {
        const msg = message({ from: { email: 'ravi@customer.in' }, to: [{ email: 'asha@nandiniinfosys.com' }], cc: [{ email: 'team@nandiniinfosys.com' }] });
        assert.equal(isAddressed(msg, 'Asha@nandiniinfosys.com'), true);
        assert.equal(isAddressed(msg, 'team@nandiniinfosys.com'), true);
        assert.equal(isAddressed(msg, 'vikram@nandiniinfosys.com'), false);
    });
});

describe('email logging: plan', () => {
    const addresses = new Map([
        ['ravi@customer.in', { contacts: ['c1'], leads: [] }],
        ['lead@prospect.in', { contacts: [], leads: ['l1'] }],
    ]);
    const opportunities = new Map([['c1', ['o1', 'o2']]]);

    it('links matched contacts, leads and the contacts’ opportunities', () => {
        const plan = planMessage(message({ cc: [{ email: 'lead@prospect.in' }] }), DOMAINS, addresses, opportunities);
        assert.equal(plan.action, 'log');
        assert.deepEqual(
            plan.action === 'log' ? plan.links.map((l) => `${l.module}:${l.recordId}`) : [],
            ['contacts:c1', 'leads:l1', 'opportunities:o1', 'opportunities:o2'],
        );
    });

    it('skips mail without a CRM address', () => {
        assert.deepEqual(planMessage(message({ from: { email: 'x@other.in' } }), DOMAINS, addresses, opportunities), { action: 'skip', reason: 'no_match' });
    });

    it('automated mail only when the customer sent it themselves', () => {
        const fromCustomer = planMessage(message({ automated: true }), DOMAINS, addresses, opportunities);
        assert.equal(fromCustomer.action, 'log');
        const newsletter = planMessage(message({ automated: true, from: { email: 'news@vendor.com' }, to: [{ email: 'ravi@customer.in' }] }), DOMAINS, addresses, opportunities);
        assert.deepEqual(newsletter, { action: 'skip', reason: 'automated' });
    });

    it('asks for the headers when automation is unknown and the sender is not a match', () => {
        const outgoing = planMessage(message({ automated: null, from: { email: 'asha@nandiniinfosys.com' }, to: [{ email: 'ravi@customer.in' }] }), DOMAINS, addresses, opportunities);
        assert.equal(outgoing.action === 'log' && outgoing.needsAutomationCheck, true);
        const incoming = planMessage(message({ automated: null }), DOMAINS, addresses, opportunities);
        assert.equal(incoming.action === 'log' && incoming.needsAutomationCheck, false);
    });

    it('bcc is never read (only from, to, cc are participants)', () => {
        const msg = message({ from: { email: 'asha@nandiniinfosys.com' }, to: [{ email: 'colleague@nandiniinfosys.com' }] });
        assert.deepEqual(planMessage(msg, DOMAINS, addresses, opportunities), { action: 'skip', reason: 'internal' });
    });
});

describe('email logging: settings and visibility', () => {
    it('reads defaults field by field', () => {
        assert.deepEqual(readEmailLoggingSettings(null), { enabled: false, defaultForPeople: 'off', visibility: 'restricted', retentionMonths: 24, storeSnippets: true, enabledAt: null, defaultOnAt: null });
        assert.deepEqual(readEmailLoggingSettings({ enabled: true, retentionMonths: 5, visibility: 'record', enabledAt: 'yesterday' }), {
            enabled: true,
            defaultForPeople: 'off',
            visibility: 'record',
            retentionMonths: 24,
            storeSnippets: true,
            enabledAt: null,
            defaultOnAt: null,
        });
        // The stamps are server-side only: a PUT body can't set them.
        assert.equal(emailLoggingSettingsPatchSchema.safeParse({ enabledAt: '2026-12-01T00:00:00.000Z' }).success, false);
        assert.equal(emailLoggingSettingsSchema.safeParse({ ...EMAIL_LOGGING_DEFAULTS, enabledAt: '2026-12-01T00:00:00.000Z' }).success, true);
        assert.equal(emailLoggingSettingsPatchSchema.safeParse({}).success, false);
        assert.equal(emailLoggingSettingsPatchSchema.safeParse({ retentionMonths: 12 }).success, true);
        assert.equal(emailLoggingSettingsPatchSchema.safeParse({ retentionMonths: 13 }).success, false);
    });

    it('stamps when the switch and the default for people turn on, keeps them otherwise', () => {
        const t1 = new Date('2026-12-01T05:00:00Z');
        const t2 = new Date('2026-12-02T05:00:00Z');
        const on = stampSettings(EMAIL_LOGGING_DEFAULTS, { ...EMAIL_LOGGING_DEFAULTS, enabled: true, defaultForPeople: 'on' }, t1);
        assert.equal(on.enabledAt, t1.toISOString());
        assert.equal(on.defaultOnAt, t1.toISOString());
        const unchanged = stampSettings(on, { ...on, retentionMonths: 12 }, t2);
        assert.equal(unchanged.enabledAt, t1.toISOString());
        const off = stampSettings(on, { ...on, enabled: false }, t2);
        const again = stampSettings(off, { ...off, enabled: true }, t2);
        assert.equal(again.enabledAt, t2.toISOString());
        assert.equal(again.defaultOnAt, t1.toISOString());
    });

    it('logging start: the latest of the company switch, the person’s switch (or the default) and the last purge', () => {
        const at = (d: string) => new Date(`2026-12-0${d}T00:00:00Z`);
        const settings = { enabledAt: at('1').toISOString(), defaultOnAt: at('3').toISOString() };
        assert.equal(loggingStartOf(null, { enabledAt: null, defaultOnAt: null }), null);
        assert.deepEqual(loggingStartOf(null, settings), at('3'));
        assert.deepEqual(loggingStartOf({ mode: 'on', loggingSince: at('2'), purgedAt: null }, settings), at('2'));
        assert.deepEqual(loggingStartOf({ mode: null, loggingSince: at('2'), purgedAt: null }, settings), at('3'));
        assert.deepEqual(loggingStartOf({ mode: 'on', loggingSince: at('2'), purgedAt: at('4') }, settings), at('4'));
    });

    it('effective mode: own switch, else the company default', () => {
        assert.equal(effectiveMode(null, { defaultForPeople: 'on' }), 'on');
        assert.equal(effectiveMode('off', { defaultForPeople: 'on' }), 'off');
        assert.equal(effectiveMode('on', { defaultForPeople: 'off' }), 'on');
    });

    it('restricted: owner and global roles see all; record: everyone who opens the record', () => {
        const rep: AuthUser = { id: 2, username: 'rep', role: 'Sales Executive' };
        const manager: AuthUser = { id: 3, username: 'mgr', role: 'Sales Manager' };
        assert.equal(seesAllRecordEmails(rep, { assignedTo: 'someone' }, 'restricted'), false);
        assert.equal(seesAllRecordEmails(rep, { assignedTo: 'REP' }, 'restricted'), true);
        assert.equal(seesAllRecordEmails(manager, { assignedTo: 'someone' }, 'restricted'), true);
        assert.equal(seesAllRecordEmails(rep, { assignedTo: 'someone' }, 'record'), true);
    });
});
