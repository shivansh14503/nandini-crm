import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstSaveDefaults, MAIL_OFF_REASONS, outboundSettingsPatchSchema, parseFromHeader, readinessOf, type MailConfig, type OutboundSettings } from './email.settings.js';

const settings = (over: Partial<OutboundSettings> = {}): OutboundSettings => ({
    provider: 'gmail',
    enabled: true,
    senderEmail: 'crm@nandiniinfosys.com',
    senderName: 'Nandini CRM',
    replyTo: null,
    dailyLimit: 1500,
    lastTestAt: null,
    lastTestOk: null,
    lastTestMessage: null,
    updatedBy: null,
    updatedAt: null,
    saved: true,
    ...over,
});
const key: { configured: boolean; clientEmail: string | null; clientId: string | null } = { configured: true, clientEmail: 'crm@proj.iam.gserviceaccount.com', clientId: '1234' };
const smtpOff = { ENABLED: false, SMTP_HOST: undefined, FROM: 'Nandini CRM <crm@nandiniinfosys.com>' };
const smtpOn = { ENABLED: true, SMTP_HOST: 'smtp-relay.gmail.com', FROM: 'Nandini CRM <crm@nandiniinfosys.com>' };
const config = (s: OutboundSettings, googleKey = key): MailConfig => ({ settings: s, googleKey });

describe('readinessOf', () => {
    it('sends with Gmail when switched on, with a sender, the Google key and the encryption key', () => {
        assert.deepEqual(readinessOf(config(settings()), smtpOff, true), { ready: true, provider: 'gmail', fromEmail: 'crm@nandiniinfosys.com', fromName: 'Nandini CRM' });
    });

    it('says why Gmail cannot send', () => {
        const reason = (c: MailConfig, enc = true) => {
            const r = readinessOf(c, smtpOff, enc);
            return r.ready ? null : r.reason;
        };
        assert.equal(reason(config(settings({ enabled: false }))), MAIL_OFF_REASONS.switchedOff);
        assert.equal(reason(config(settings({ senderEmail: null }))), MAIL_OFF_REASONS.noSender);
        assert.equal(reason(config(settings()), false), MAIL_OFF_REASONS.noEncryptionKey);
        assert.equal(reason(config(settings(), { configured: false, clientEmail: null, clientId: null })), MAIL_OFF_REASONS.noGoogleKey);
    });

    it('keeps the SMTP environment settings working while no settings are saved', () => {
        const legacy = settings({ provider: 'smtp', saved: false, senderEmail: null, senderName: null });
        assert.deepEqual(readinessOf(config(legacy), smtpOn, false), { ready: true, provider: 'smtp', fromEmail: 'crm@nandiniinfosys.com', fromName: 'Nandini CRM' });
        assert.equal(readinessOf(config(legacy), smtpOff, false).ready, false);
        assert.equal(readinessOf(config(settings({ provider: 'smtp', enabled: false })), smtpOn, false).ready, false);
    });
});

describe('outbound settings', () => {
    it('parses a From header', () => {
        assert.deepEqual(parseFromHeader('Nandini CRM <crm@x.com>'), { name: 'Nandini CRM', email: 'crm@x.com' });
        assert.deepEqual(parseFromHeader('crm@x.com'), { name: null, email: 'crm@x.com' });
    });

    it('validates a patch: emails, a header-safe display name and the Google daily cap', () => {
        assert.deepEqual(outboundSettingsPatchSchema.parse({ senderEmail: ' CRM@Nandiniinfosys.com ', senderName: 'Nandini\r\n<CRM>' }), {
            senderEmail: 'crm@nandiniinfosys.com',
            senderName: 'Nandini CRM',
        });
        assert.equal(outboundSettingsPatchSchema.parse({ replyTo: '' }).replyTo, null);
        assert.equal(outboundSettingsPatchSchema.safeParse({ senderEmail: 'nope' }).success, false);
        assert.equal(outboundSettingsPatchSchema.safeParse({ dailyLimit: 2001 }).success, false);
        assert.equal(outboundSettingsPatchSchema.safeParse({}).success, false);
        assert.equal(outboundSettingsPatchSchema.safeParse({ password: 'x' }).success, false);
    });
});

describe('firstSaveDefaults', () => {
    it('starts on SMTP, switched on, while the server SMTP settings are on, so a first check never turns mail off', () => {
        assert.deepEqual(firstSaveDefaults(true), { provider: 'smtp', enabled: true });
        const row = settings({ ...firstSaveDefaults(true), saved: true, senderEmail: null, senderName: null });
        assert.equal(readinessOf(config(row), { ENABLED: true, SMTP_HOST: 'smtp.gmail.com', FROM: 'Nandini CRM <crm@nandiniinfosys.com>' }, false).ready, true);
    });
    it('starts on the Gmail API, switched off, when SMTP is off on the server', () => {
        assert.deepEqual(firstSaveDefaults(false), { provider: 'gmail', enabled: false });
    });
});
