import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { configureSecretBox, parseKeyRing, secretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { setCheckSchedulerForTests } from '../calendar-sync/enrolment.js';
import { resetFakeProvider } from '../calendar-sync/providers/fake.js';
import { setFakeHealth, setFakeProviderEnabledForTests } from '../calendar-sync/providers/registry.js';
import {
    blankConnection,
    googleProviderRow,
    installConnectionDouble,
    restoreConnectionDouble,
    type ConnectionRowState,
    type UserRow,
} from '../calendar-sync/testing/connectionDouble.js';
import { fakeFetch, route, type RecordedCall } from '../calendar-sync/testing/fakeFetch.js';
import { serviceAccountKeyJson, TEST_CLIENT_EMAIL, TEST_CLIENT_ID, TEST_PRIVATE_KEY_ID } from '../calendar-sync/testing/serviceAccountKey.js';
import { setTokenSourceForTests } from '../calendar-sync/tokenSource.js';
import { formConfigService, type FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { userEmailService } from '../users/userEmail.service.js';
import { GOOGLE_DWD_SCOPES, GOOGLE_DWD_SCOPES_ADMIN_CONSOLE, GOOGLE_TOKEN_URL } from './integration.constants.js';
import { expiresSoon, integrationService, loadProviderCredentials, peopleFrom } from './integration.service.js';
import { loadCalendarSettings, saveCalendarSettings } from './integration.settings.js';

/**
 * integration.service (Admin › API Integrations) against the in-memory calendar double (calendar-sync/testing): the
 * secret box runs for real on a random test key; Google / Microsoft answers come from fakeFetch.
 */

const admin: AuthUser = { id: 99, username: 'admin', role: 'Admin' };
const now = new Date('2026-11-26T06:00:00.000Z');
const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const MS_TOKEN = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

function followupConfigs(options: { value: string; meta?: Record<string, unknown> | null; isActive?: boolean }[], calendarSync?: unknown): FormConfigsPayload {
    return {
        categories: [
            {
                id: 'cat-ft',
                key: 'shared_followup_type',
                label: 'Followup Type',
                module: 'shared',
                options: options.map((o, i) => ({
                    id: `opt-${o.value}`,
                    categoryId: 'cat-ft',
                    value: o.value,
                    label: o.value,
                    meta: o.meta ?? null,
                    sortOrder: i,
                    isActive: o.isActive ?? true,
                    isSystem: false,
                    isDefault: false,
                })),
            },
        ],
        fieldsByModule: {},
        moduleTabs: {},
        moduleSettings: calendarSync === undefined ? {} : { activities: { calendarSync } },
    } as unknown as FormConfigsPayload;
}

const DEFAULT_CONFIGS = () => followupConfigs([{ value: 'Call' }, { value: 'Meeting', meta: { icon: 'meeting' } }, { value: 'Task' }, { value: 'Note' }], { companyDomains: ['nandiniinfosys.com', 'nandini.in'] });

/** The double plus the Form Builder writes the settings / sync types use. */
function setup(seed: Parameters<typeof installConnectionDouble>[0] = {}) {
    const state = installConnectionDouble({ configs: DEFAULT_CONFIGS(), ...seed });
    const optionUpdates: { id: string; body: unknown }[] = [];
    const settingSaves: unknown[] = [];
    mock.method(formConfigService, 'updateOption', async (id: string, body: { meta: Record<string, unknown> }) => {
        optionUpdates.push({ id, body });
        state.configs = {
            ...state.configs,
            categories: state.configs.categories.map((c) => ({ ...c, options: c.options.map((o) => (o.id === id ? { ...o, meta: body.meta } : o)) })),
        } as FormConfigsPayload;
        return {};
    });
    mock.method(formConfigService, 'updateModuleSetting', async (module: string, key: string, body: { value: unknown }) => {
        settingSaves.push({ module, key, value: body.value });
        state.configs = { ...state.configs, moduleSettings: { ...state.configs.moduleSettings, activities: { [key]: body.value } } } as FormConfigsPayload;
        return body.value;
    });
    return { state, optionUpdates, settingSaves };
}

const expectHttp = async (promise: Promise<unknown>, status: number, code?: string) => {
    await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof HttpError, `expected HttpError, got ${String(err)}`);
        assert.equal(err.statusCode, status);
        if (code) assert.equal(err.code, code);
        return true;
    });
};

/** Google accepts every assertion (key check and impersonation) and the probe answers 200. */
function googleOk() {
    return fakeFetch([
        route(GOOGLE_TOKEN_URL, () => ({ status: 200, body: { access_token: 'ya29.test', expires_in: 3600 } })),
        route('https://www.googleapis.com/calendar/v3/', () => ({ status: 200, body: { items: [] } })),
    ]);
}

const person = (id: number, username: string, over: Partial<UserRow> = {}): UserRow => ({
    id,
    username,
    fullName: username,
    department: 'Sales',
    role: 'Sales Executive',
    email: `${username}@nandiniinfosys.com`,
    isActive: true,
    isGroupUser: false,
    ...over,
});

let scheduled: string[];

beforeEach(() => {
    configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
    resetFakeProvider();
    setFakeHealth('unknown', null);
    setFakeProviderEnabledForTests(false);
    setTokenSourceForTests(null);
    scheduled = [];
    setCheckSchedulerForTests((id) => scheduled.push(id));
});

afterEach(() => {
    restoreConnectionDouble();
    configureSecretBox(null);
    setFakeProviderEnabledForTests(null);
    setCheckSchedulerForTests(null);
});

describe('Google Workspace provider', () => {
    it('stores the uploaded key sealed; the DTO shows the client email, numeric client ID and exact scopes, never the key', async () => {
        const { state } = setup();
        const dto = await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        assert.equal(dto.configured, true);
        assert.equal(dto.enabled, false);
        assert.equal(dto.clientId, TEST_CLIENT_ID);
        assert.deepEqual(
            { clientEmail: dto.serviceAccount?.clientEmail, clientId: dto.serviceAccount?.clientId, privateKeyId: dto.serviceAccount?.privateKeyId },
            { clientEmail: TEST_CLIENT_EMAIL, clientId: TEST_CLIENT_ID, privateKeyId: TEST_PRIVATE_KEY_ID },
        );
        assert.deepEqual(dto.scopes, [...GOOGLE_DWD_SCOPES]);
        assert.equal(dto.scopesAdminConsole, GOOGLE_DWD_SCOPES_ADMIN_CONSOLE);
        assert.equal(dto.secret.set, false, 'Google has no client secret');
        assert.ok(!JSON.stringify(dto).includes('PRIVATE KEY'), 'key leaked into the DTO');

        const row = state.providers.get('google')!;
        assert.match(String(row.secretsEnc), /^enc:v1:k1:/);
        assert.ok(!String(row.secretsEnc).includes('PRIVATE'));
        assert.ok(!String(row.secretHintsJson).includes('PRIVATE'));
        const sealed = JSON.parse(secretBox.open(String(row.secretsEnc), 'IntegrationProvider:google:secrets')) as { serviceAccountKey: string };
        assert.equal(sealed.serviceAccountKey, serviceAccountKeyJson());

        assert.equal(state.audits.length, 1);
        assert.equal(state.audits[0].action, 'CREATE');
        assert.equal((state.audits[0].changes as Record<string, unknown>).serviceAccountKeyChanged, true);
        assert.ok(!JSON.stringify(state.audits).includes('PRIVATE KEY'), 'key leaked into the audit entry');
    });

    it('refuses a bad key file (400 on serviceAccountKey), a typed client ID and a client secret', async () => {
        setup();
        await assert.rejects(integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson({ type: 'authorized_user' }) }, admin, now), (err: unknown) => {
            assert.ok(err instanceof HttpError);
            assert.equal(err.statusCode, 400);
            assert.deepEqual(err.errors?.[0]?.path, ['serviceAccountKey']);
            return true;
        });
        await expectHttp(integrationService.saveProvider('google', { clientId: '123' }, admin, now), 400);
        await expectHttp(integrationService.saveProvider('google', { clientSecret: 'GOCSPX-x' }, admin, now), 400);
        await expectHttp(integrationService.saveProvider('microsoft', { serviceAccountKey: serviceAccountKeyJson() }, admin, now), 400);
    });

    it('switching on needs a key (409 INTEGRATION_NOT_CONFIGURED) and a passing app test with this key (409 INTEGRATION_NOT_TESTED)', async () => {
        const { state } = setup();
        await expectHttp(integrationService.saveProvider('google', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_CONFIGURED');
        assert.equal(state.providers.size, 0, 'rolled back');
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        await expectHttp(integrationService.saveProvider('google', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_TESTED');

        const test = await integrationService.testProvider('google', {}, googleOk().fetchImpl, now);
        assert.equal(test.code, 'key_ok');
        assert.equal((await integrationService.getProvider('google')).appTested, true);
        const on = await integrationService.saveProvider('google', { enabled: true, settings: { domains: ['nandiniinfosys.com'] } }, admin, now);
        assert.equal(on.enabled, true);
        assert.deepEqual(on.domains, ['nandiniinfosys.com']);

        // A new key bumps the version and forgets the test (the provider stays on).
        const replaced = await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson({ private_key_id: 'ffffffffffffffffffffffffffffffffffffffff' }) }, admin, now);
        assert.equal(replaced.clientVersion, 2);
        assert.equal(replaced.appTested, false);
        assert.equal(replaced.lastTest, null);
        assert.equal(replaced.enabled, true);
    });

    it('switching on enrols everyone on its domains, and switching off stops them (provider_removed)', async () => {
        const { state } = setup({ users: [person(1, 'asha'), person(2, 'ravi', { email: 'ravi@nandini.in' }), person(3, 'admin', { role: 'Admin' })] });
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson(), settings: { domains: ['NandiniInfosys.com'] } }, admin, now);
        await integrationService.testProvider('google', {}, googleOk().fetchImpl, now);
        assert.equal(state.connections.length, 0, 'nobody before it is on');
        await integrationService.saveProvider('google', { enabled: true }, admin, now);
        assert.deepEqual(state.connections.map((c) => [c.username, c.provider, c.status]).sort(), [
            ['admin', 'google', 'pending'],
            ['asha', 'google', 'pending'],
        ]);
        assert.equal(scheduled.length, 2, 'first checks scheduled');
        assert.ok(state.audits.some((a) => a.entityType === 'CalendarConnection' && a.action === 'ENROL' && a.changedBy === 'admin'));
        assert.deepEqual((await integrationService.getProvider('google')).counts, { ok: 0, pending: 2, error: 0, excluded: 0 });

        await integrationService.saveProvider('google', { enabled: false }, admin, now);
        assert.ok(state.connections.every((c) => c.status === 'stopped' && c.statusReason === 'provider_removed'));
    });

    it('domains: only company domains (400), one provider per domain (409 DOMAIN_IN_USE)', async () => {
        setup();
        await expectHttp(integrationService.saveProvider('google', { settings: { domains: ['gmail.com'] } }, admin, now), 400);
        await integrationService.saveProvider('google', { settings: { domains: ['nandiniinfosys.com'] } }, admin, now);
        await expectHttp(integrationService.saveProvider('microsoft', { settings: { domains: ['nandiniinfosys.com'] } }, admin, now), 409, 'DOMAIN_IN_USE');
        const ms = await integrationService.saveProvider('microsoft', { settings: { domains: ['@Nandini.in'] } }, admin, now);
        assert.deepEqual(ms.domains, ['nandini.in']);
    });

    it('removing the key switches Google off, clears the client ID and stops people', async () => {
        const { state } = setup({
            users: [person(1, 'asha')],
            providers: [googleProviderRow({ secretHintsJson: JSON.stringify({ appTest: { ok: true, version: 1, at: now.toISOString() } }) })],
        });
        await integrationService.saveProvider('google', { settings: { domains: ['nandiniinfosys.com'] } }, admin, now);
        assert.equal(state.connections.filter((c) => c.status === 'pending').length, 1);
        const dto = await integrationService.clearSecret('google', admin);
        assert.equal(dto.enabled, false);
        assert.equal(dto.clientId, null);
        assert.equal(dto.serviceAccount?.set ?? false, false);
        assert.equal(dto.clientVersion, 2);
        assert.equal(state.providers.get('google')!.secretsEnc, null);
        assert.equal(state.connections[0].statusReason, 'provider_removed');
        assert.deepEqual(state.audits.find((a) => a.entityType === 'IntegrationProvider')?.changes, { secretCleared: true, enabled: { from: true, to: false } });
    });

    it('refuses a key while the encryption key is missing (503 INTEGRATIONS_NOT_READY)', async () => {
        setup();
        configureSecretBox(null);
        await expectHttp(integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now), 503, 'INTEGRATIONS_NOT_READY');
    });

    it('serves the decrypted key to the token source, cached until the next save', async () => {
        setup();
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        const first = await loadProviderCredentials('google');
        assert.equal(first.serviceAccountKey, serviceAccountKeyJson());
        assert.equal(first.configured, true);
        assert.equal(first.clientSecret, null);
    });
});

describe('Test connection', () => {
    it('never calls Google without a key; stores the result and the passing app step', async () => {
        const { state } = setup();
        const none = googleOk();
        assert.equal((await integrationService.testProvider('google', {}, none.fetchImpl, now)).code, 'not_configured');
        assert.equal(none.calls.length, 0);
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        const result = await integrationService.testProvider('google', {}, googleOk().fetchImpl, now);
        assert.equal(result.ok, true);
        assert.equal(result.testedAt, now.toISOString());
        const row = state.providers.get('google')!;
        assert.equal(row.lastTestOk, true);
        assert.match(String(row.lastTestMessage), /accepted the service account key/);
        assert.equal((JSON.parse(String(row.secretHintsJson)) as { appTest: { version: number } }).appTest.version, 1);
    });

    it('as a user: impersonates their email; an unknown user is 404; a failing user step still records the app pass', async () => {
        setup({ users: [person(1, 'asha')] });
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        const ok = googleOk();
        const result = await integrationService.testProvider('google', { asUsername: 'asha' }, ok.fetchImpl, now);
        assert.equal(result.code, 'delegation_ok');
        const subjectOf = (call: RecordedCall) => (JSON.parse(Buffer.from(call.form!.assertion.split('.')[1], 'base64url').toString()) as { sub?: string }).sub;
        assert.equal(subjectOf(ok.calls[1]), 'asha@nandiniinfosys.com');
        await expectHttp(integrationService.testProvider('google', { asUsername: 'nobody' }, ok.fetchImpl, now), 404);

        const denied = fakeFetch([
            route(GOOGLE_TOKEN_URL, (call) =>
                subjectOf(call) ? { status: 401, body: { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens.' } } : { status: 200, body: { access_token: 'sa', expires_in: 3600 } },
            ),
        ]);
        const failed = await integrationService.testProvider('google', { asUsername: 'asha' }, denied.fetchImpl, now);
        assert.equal(failed.code, 'delegation_missing');
        assert.equal((await integrationService.getProvider('google')).appTested, true);
    });

    it("doesn't store a result for credentials that were replaced while the test ran", async () => {
        const { state } = setup();
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        const racing = fakeFetch([
            route(GOOGLE_TOKEN_URL, async () => {
                // An admin uploads another key while Google is still answering for the old one.
                await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson({ private_key_id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }) }, admin, now);
                return { status: 200, body: { access_token: 'x', expires_in: 3600 } };
            }),
        ]);
        const result = await integrationService.testProvider('google', {}, racing.fetchImpl, now);
        assert.equal(result.code, 'credentials_changed');
        const row = state.providers.get('google')!;
        assert.equal(row.lastTestAt, null);
        assert.equal((await integrationService.getProvider('google')).appTested, false);
    });

    it('Microsoft: needs the tenant to switch on; client credentials test; the secret stays write-only', async () => {
        const { state } = setup();
        await expectHttp(integrationService.saveProvider('microsoft', { enabled: true, clientId: 'app-id', clientSecret: 'secret-value-1' }, admin, now), 400, 'VALIDATION_ERROR');
        await assert.rejects(integrationService.saveProvider('microsoft', { settings: { tenantId: 'https://evil.example/x' } }, admin, now));
        const saved = await integrationService.saveProvider(
            'microsoft',
            { clientId: 'app-id', clientSecret: 'secret-value-wxyz', settings: { tenantId: TENANT.toUpperCase() }, clientSecretExpiresOn: '2027-01-31' },
            admin,
            now,
        );
        assert.equal(saved.settings.tenantId, TENANT);
        assert.equal(saved.secret.last4, 'wxyz');
        assert.equal(saved.secret.expiresOn, '2027-01-31');
        assert.ok(!JSON.stringify(saved).includes('secret-value'));
        const token = `h.${Buffer.from(JSON.stringify({ roles: ['Calendars.ReadWrite'] })).toString('base64url')}.s`;
        const ms = fakeFetch([route(MS_TOKEN, () => ({ status: 200, body: { access_token: token, expires_in: 3600 } }))]);
        const result = await integrationService.testProvider('microsoft', {}, ms.fetchImpl, now);
        assert.equal(result.code, 'credentials_ok');
        assert.equal(ms.calls[0].form?.client_secret, 'secret-value-wxyz');
        assert.equal((await integrationService.saveProvider('microsoft', { enabled: true }, admin, now)).enabled, true);
        assert.ok(!JSON.stringify(state.audits).includes('secret-value'), 'secret leaked into the audit entry');
        // A changed tenant is new credentials.
        assert.equal((await integrationService.saveProvider('microsoft', { settings: { tenantId: 'other.onmicrosoft.com' } }, admin, now)).clientVersion, 2);
    });

    it('Zoom: credentials stored, no check, no switch', async () => {
        setup();
        const dto = await integrationService.saveProvider('zoom', { clientId: 'zoom-id', clientSecret: 'zoom-secret-1', webhookSecret: 'zoom-hook-abcd' }, admin, now);
        assert.equal(dto.available, false);
        assert.equal(dto.webhookSecret?.last4, 'abcd');
        assert.equal((await integrationService.testProvider('zoom', {}, googleOk().fetchImpl, now)).code, 'not_available');
        await expectHttp(integrationService.saveProvider('zoom', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_AVAILABLE');
    });

    it('shows an unreadable key after an encryption key change and refuses to switch on until it is uploaded again', async () => {
        const { state } = setup();
        await integrationService.saveProvider('google', { serviceAccountKey: serviceAccountKeyJson() }, admin, now);
        const sealed = state.providers.get('google')!.secretsEnc;
        configureSecretBox(parseKeyRing(`k2:${randomBytes(32).toString('base64')}`));
        const dto = await integrationService.getAdmin(now);
        assert.equal(dto.keyStatus, 'unreadable');
        assert.equal(dto.providers.find((p) => p.provider === 'google')?.configured, false);
        await expectHttp(integrationService.saveProvider('google', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_CONFIGURED');
        await integrationService.saveProvider('google', { settings: { domains: ['nandiniinfosys.com'] } }, admin, now);
        assert.equal(state.providers.get('google')!.secretsEnc, sealed, 'an unrelated save keeps the unreadable value');
    });

    it('flags a client secret expiring within 30 days', () => {
        assert.equal(expiresSoon('2026-12-20', now), true);
        assert.equal(expiresSoon('2027-06-01', now), false);
        assert.equal(expiresSoon('2026-11-01', now), true);
        assert.equal(expiresSoon(null, now), false);
    });
});

describe('settings and sync types', () => {
    it('reads defaults when nothing is stored, and the meeting type from the option icon', async () => {
        setup({ configs: followupConfigs([{ value: 'Call' }, { value: 'Client Meeting', meta: { icon: 'meeting' } }]) });
        const settings = await loadCalendarSettings();
        assert.deepEqual(settings.companyDomains, ['nandiniinfosys.com']);
        assert.equal(settings.eventVisibility, 'private');
        assert.equal(settings.importFollowupType, 'Client Meeting');
    });

    it('merges a partial update and saves the whole value through updateModuleSetting', async () => {
        const { settingSaves } = setup();
        const saved = await saveCalendarSettings({ companyDomains: ['NandiniInfosys.com', 'nipl.in'], backfillDays: 30 }, admin);
        assert.deepEqual(saved.companyDomains, ['nandiniinfosys.com', 'nipl.in']);
        assert.equal(saved.backfillDays, 30);
        assert.deepEqual(settingSaves[0], { module: 'activities', key: 'calendarSync', value: saved });
        await assert.rejects(saveCalendarSettings({ backfillDays: 45 }, admin));
        await assert.rejects(saveCalendarSettings({}, admin));
    });

    it("can't drop a company domain a provider still serves (409 DOMAIN_IN_USE)", async () => {
        const { settingSaves } = setup({ providers: [{ provider: 'google', enabled: false, settingsJson: JSON.stringify({ domains: ['nandini.in'] }) }] });
        await expectHttp(saveCalendarSettings({ companyDomains: ['nandiniinfosys.com'] }, admin), 409, 'DOMAIN_IN_USE');
        assert.equal(settingSaves.length, 0);
    });

    it('lists Followup Types with Task / Note locked off; saves real changes through the option update', async () => {
        const { optionUpdates, state } = setup({ configs: followupConfigs([{ value: 'Call', meta: { icon: 'call' } }, { value: 'WhatsApp', meta: { calendarSync: false } }, { value: 'Task' }]) });
        assert.deepEqual(await integrationService.getSyncTypes(), [
            { value: 'Call', label: 'Call', calendarSync: true, locked: false },
            { value: 'WhatsApp', label: 'WhatsApp', calendarSync: false, locked: false },
            { value: 'Task', label: 'Task', calendarSync: false, locked: true, lockReason: 'Tasks and notes never go to calendars.' },
        ]);
        const types = await integrationService.saveSyncTypes({ Call: false, whatsapp: false, Task: false }, admin);
        assert.deepEqual(optionUpdates, [{ id: 'opt-Call', body: { meta: { icon: 'call', calendarSync: false } } }]);
        assert.equal(types.find((t) => t.value === 'Call')!.calendarSync, false);
        assert.ok(state.cacheInvalidations.some((p) => p.includes('form-configs')));
        await expectHttp(integrationService.saveSyncTypes({ Task: true }, admin), 400);
        await expectHttp(integrationService.saveSyncTypes({ Fax: true }, admin), 400);
    });
});

describe('People', () => {
    const users: UserRow[] = [
        person(1, 'asha', { fullName: 'Asha Rao' }),
        person(2, 'ravi', { email: 'Shared@NandiniInfosys.com' }),
        person(3, 'mohan', { department: null, email: 'shared@nandiniinfosys.com ' }),
        person(4, 'support', { isGroupUser: true, email: 'asha@nandiniinfosys.com' }),
        person(5, 'old', { isActive: false, email: 'asha@nandiniinfosys.com' }),
        person(6, 'gmail', { email: 'someone@gmail.com' }),
        person(7, 'none', { fullName: '', email: null }),
    ];

    it('lists active non-group users with missing / duplicate / not_company flags (pure)', () => {
        const people = peopleFrom(users as never, ['nandiniinfosys.com']);
        assert.deepEqual(
            people.map((p) => [p.username, p.emailIssue]),
            [
                ['asha', null],
                ['ravi', 'duplicate'],
                ['mohan', 'duplicate'],
                ['gmail', 'not_company'],
                ['none', 'missing'],
            ],
        );
        assert.equal(people.find((p) => p.username === 'none')!.fullName, 'none');
        assert.deepEqual(peopleFrom(users as never, ['nandiniinfosys.com'], { issue: 'any' }).map((p) => p.username), ['ravi', 'mohan', 'gmail', 'none']);
        assert.deepEqual(peopleFrom(users as never, ['nandiniinfosys.com'], { search: 'RAO' }).map((p) => p.username), ['asha']);
    });

    it('each person: the calendar target or why not, the live row, the admin choice; calendar_problem filter', async () => {
        setFakeProviderEnabledForTests(true);
        const conn = (over: Partial<ConnectionRowState> & Pick<ConnectionRowState, 'id' | 'username'>) =>
            blankConnection({ provider: 'fake', accountEmail: `${over.username}@nandiniinfosys.com`, ...over }, now);
        setup({
            users,
            connections: [
                conn({ id: 'c-asha', username: 'asha', status: 'error', statusReason: 'calendar_unavailable', lastErrorMessage: 'Calendar off' }),
                conn({ id: 'c-old', username: 'gmail', status: 'stopped', statusReason: 'no_email' }),
            ],
            syncUsers: [{ username: 'ravi', excluded: true, note: 'Shared inbox' }],
        });
        const people = await integrationService.listPeople({});
        const byName = new Map(people.map((p) => [p.username, p.calendar]));
        assert.deepEqual(byName.get('asha')?.target, { provider: 'fake', email: 'asha@nandiniinfosys.com', source: 'domain' });
        assert.equal(byName.get('asha')?.connection?.id, 'c-asha');
        assert.equal(byName.get('asha')?.connection?.lastErrorMessage, 'Calendar off');
        assert.equal(byName.get('ravi')?.reason, 'excluded');
        assert.deepEqual(byName.get('ravi')?.choice, { provider: null, excluded: true, note: 'Shared inbox', importMeetings: false });
        assert.equal(byName.get('gmail')?.reason, 'not_company');
        assert.equal(byName.get('gmail')?.connection, null, 'a stopped row is not shown as live');
        assert.equal(byName.get('none')?.reason, 'no_email');
        assert.deepEqual((await integrationService.listPeople({ issue: 'calendar_problem' })).map((p) => p.username), ['asha']);
    });

    it('saves a lower-cased company email, audited, drops the user cache, and enrols the person', async () => {
        setFakeProviderEnabledForTests(true);
        const { state } = setup({ users });
        const saved = await integrationService.setPersonEmail('none', { email: '  New.Person@NandiniInfosys.com ' }, admin);
        assert.equal(saved.email, 'new.person@nandiniinfosys.com');
        assert.equal(saved.emailIssue, null);
        assert.deepEqual(state.audits.find((a) => a.entityType === 'User'), {
            entityType: 'User',
            entityId: '7',
            action: 'UPDATE',
            changedBy: 'admin',
            changes: { email: { from: null, to: 'new.person@nandiniinfosys.com' } },
        });
        assert.ok(state.cacheInvalidations.includes('cache:lookups:users*'));
        assert.equal(saved.calendar.connection?.accountEmail, 'new.person@nandiniinfosys.com');
        assert.equal(saved.calendar.connection?.status, 'pending');
    });

    it('a new email moves the person’s calendar sync (the old row stops as email_changed); no more EMAIL_CONNECTED', async () => {
        setFakeProviderEnabledForTests(true);
        const { state } = setup({ users, connections: [blankConnection({ id: 'c-asha', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now)] });
        const saved = await integrationService.setPersonEmail('asha', { email: 'asha.rao@nandiniinfosys.com' }, admin);
        assert.equal(saved.email, 'asha.rao@nandiniinfosys.com');
        assert.equal(state.connections.find((c) => c.id === 'c-asha')?.statusReason, 'email_changed');
        assert.equal(saved.calendar.connection?.accountEmail, 'asha.rao@nandiniinfosys.com');
        // Cleared: the row stops (no_email).
        await integrationService.setPersonEmail('asha', { email: '' }, admin);
        assert.ok(state.connections.every((c) => c.status === 'stopped'));
    });

    it('refuses an address another active user holds (409 DUPLICATE_RECORD); other domains only when allowed', async () => {
        const { state } = setup({ users });
        await expectHttp(integrationService.setPersonEmail('none', { email: 'ASHA@nandiniinfosys.com' }, admin), 409, 'DUPLICATE_RECORD');
        assert.equal(state.users.find((u) => u.username === 'none')!.email, null);
        await expectHttp(integrationService.setPersonEmail('none', { email: 'x@vendor.com' }, admin), 400, 'VALIDATION_ERROR');
        assert.equal((await integrationService.setPersonEmail('none', { email: 'x@vendor.com', allowOtherDomain: true }, admin)).emailIssue, 'not_company');
        await expectHttp(integrationService.setPersonEmail('nobody', { email: 'a@nandiniinfosys.com' }, admin), 404);
    });

    it('writes nothing for an unchanged address', async () => {
        const { state } = setup({ users });
        await userEmailService.setEmail('asha', { email: 'asha@nandiniinfosys.com' }, { companyDomains: ['nandiniinfosys.com'], actor: admin });
        assert.equal(state.audits.length, 0);
        assert.equal(state.cacheInvalidations.length, 0);
    });

    it('calendar choice: exclude (row stops, audited), override, back to default (choice row deleted)', async () => {
        setFakeProviderEnabledForTests(true);
        const { state } = setup({ users, providers: [googleProviderRow({ domains: ['nandiniinfosys.com'] })] });
        // Google is on for the domain; asha is enrolled with Google.
        await integrationService.saveProvider('google', { settings: { domains: ['nandiniinfosys.com'] } }, admin, now);
        assert.equal(state.connections.find((c) => c.username === 'asha')?.provider, 'google');

        const excluded = await integrationService.setPersonCalendar('asha', { excluded: true, note: 'Uses a shared calendar' }, admin);
        assert.equal(excluded.calendar.reason, 'excluded');
        assert.equal(excluded.calendar.connection, null);
        assert.equal(state.connections.find((c) => c.username === 'asha')?.statusReason, 'excluded');
        const audit = state.audits.find((a) => a.entityType === 'CalendarSyncUser')!;
        assert.equal(audit.action, 'CREATE');
        assert.deepEqual(audit.changes, { username: 'asha', excluded: { from: false, to: true }, note: { from: null, to: 'Uses a shared calendar' } });
        assert.deepEqual((await integrationService.getProvider('google')).counts.excluded, 1);

        const override = await integrationService.setPersonCalendar('asha', { excluded: false, provider: 'fake', note: null }, admin);
        assert.deepEqual(override.calendar.target, { provider: 'fake', email: 'asha@nandiniinfosys.com', source: 'override' });
        assert.equal(override.calendar.connection?.provider, 'fake');

        const back = await integrationService.setPersonCalendar('asha', { provider: null }, admin);
        assert.equal(back.calendar.choice, null);
        assert.equal(back.calendar.connection?.provider, 'google');
        assert.equal(state.syncUsers.length, 0);
        assert.equal(state.audits.filter((a) => a.entityType === 'CalendarSyncUser').at(-1)?.action, 'DELETE');
    });

    it('calendar choice: the test calendar only while the fake is on (400); unknown person 404; unknown field 400', async () => {
        setup({ users });
        await expectHttp(integrationService.setPersonCalendar('asha', { provider: 'fake' }, admin), 400);
        await expectHttp(integrationService.setPersonCalendar('nobody', { excluded: true }, admin), 404);
        await assert.rejects(integrationService.setPersonCalendar('asha', { excluded: true, other: 1 }, admin));
    });

    it('Check now: 409 CALENDAR_NOT_SYNCED without a live row; otherwise checks and returns the person', async () => {
        setFakeProviderEnabledForTests(true);
        const { state } = setup({ users: [person(1, 'asha')], connections: [blankConnection({ id: 'c1', username: 'asha', provider: 'fake', accountEmail: 'asha@nandiniinfosys.com' }, now)] });
        await expectHttp(integrationService.checkPersonCalendar('ravi'), 409, 'CALENDAR_NOT_SYNCED');
        const checked = await integrationService.checkPersonCalendar('asha');
        assert.equal(checked.check, 'ok');
        assert.equal(checked.calendar.connection?.status, 'ok');
        assert.equal(state.connections[0].status, 'ok');
    });

    it('provider cards count live rows by status and exclusions once per person', async () => {
        setup({
            users,
            connections: [
                blankConnection({ id: 'a', username: 'asha', provider: 'google', accountEmail: 'asha@nandiniinfosys.com', status: 'ok' }, now),
                blankConnection({ id: 'b', username: 'ravi', provider: 'google', accountEmail: 'ravi@nandiniinfosys.com', status: 'error' }, now),
                blankConnection({ id: 'c', username: 'mohan', provider: 'google', accountEmail: 'mohan@nandiniinfosys.com', status: 'stopped', statusReason: 'excluded' }, now),
                blankConnection({ id: 'd', username: 'mohan', provider: 'google', accountEmail: 'mohan2@nandiniinfosys.com', status: 'stopped', statusReason: 'excluded' }, now),
            ],
        });
        const dto = await integrationService.getAdmin(now);
        assert.deepEqual(dto.providers.find((p) => p.provider === 'google')!.counts, { ok: 1, pending: 0, error: 1, excluded: 1 });
        assert.deepEqual(dto.providers.find((p) => p.provider === 'microsoft')!.counts, { ok: 0, pending: 0, error: 0, excluded: 0 });
        assert.equal(dto.fakeProvider, false);
    });
});
