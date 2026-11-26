import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { prisma } from '../../config/prisma.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import { configureSecretBox, parseKeyRing, secretBox } from '../../services/secretBox.js';
import type { AuthUser } from '../../types/user.types.js';
import { HttpError } from '../../utils/httpError.js';
import { formConfigService, type FormConfigsPayload } from '../form-configs/formConfig.service.js';
import { userEmailService } from '../users/userEmail.service.js';
import { saveCalendarSettings, loadCalendarSettings } from './integration.settings.js';
import { dropProviderCredentialsCache, expiresSoon, integrationService, loadProviderCredentials, peopleFrom } from './integration.service.js';
import type { FetchLike } from './integration.test-connection.js';

/**
 * integration.service against a Prisma double: in-memory IntegrationProvider and Users rows, a `$transaction` that
 * hands the callback a client over the same rows (rolled back when it throws), audit / cache / form-config calls
 * captured. The secret box runs for real on a random test key.
 */

const admin: AuthUser = { id: 1, username: 'admin', role: 'Admin' };
const now = new Date('2026-11-26T06:00:00.000Z');

interface ProviderState {
    provider: string;
    enabled: boolean;
    clientId: string | null;
    secretsEnc: string | null;
    keyId: string | null;
    secretHintsJson: string | null;
    settingsJson: string | null;
    clientVersion: number;
    lastTestAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMessage: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface UserState {
    id: number;
    username: string;
    fullName: string;
    department: string | null;
    role: string;
    email: string | null;
    isActive: boolean;
    isGroupUser: boolean;
}

const blankRow = (provider: string): ProviderState => ({
    provider,
    enabled: false,
    clientId: null,
    secretsEnc: null,
    keyId: null,
    secretHintsJson: null,
    settingsJson: null,
    clientVersion: 1,
    lastTestAt: null,
    lastTestOk: null,
    lastTestMessage: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
});

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

/**
 * Prisma's model delegates are created lazily behind a proxy, so `mock.method` can't wrap their methods: the delegate
 * itself is swapped for the fake and the real one put back after each test (`restoreDelegates`).
 */
const realDelegates = new Map<string, unknown>();
function stubDelegate(name: 'integrationProvider' | 'user' | '$transaction', fake: object): void {
    const client = prisma as unknown as Record<string, unknown>;
    if (!realDelegates.has(name)) realDelegates.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}
function restoreDelegates(): void {
    for (const [name, real] of realDelegates) Object.defineProperty(prisma, name, { value: real, configurable: true, writable: true });
    realDelegates.clear();
}

function setup(seed: { providers?: ProviderState[]; users?: UserState[]; configs?: FormConfigsPayload } = {}) {
    const state = {
        providers: new Map((seed.providers ?? []).map((row) => [row.provider, { ...row }])),
        users: (seed.users ?? []).map((u) => ({ ...u })),
    };
    const audits: AuditEntry[] = [];
    const invalidated: string[] = [];
    const optionUpdates: { id: string; body: unknown }[] = [];
    const settingSaves: unknown[] = [];

    const providerModel = {
        findUnique: async ({ where }: { where: { provider: string } }) => {
            const row = state.providers.get(where.provider);
            return row ? { ...row } : null;
        },
        findMany: async () => [...state.providers.values()].map((row) => ({ ...row })),
        upsert: async ({ where, create, update }: { where: { provider: string }; create: Partial<ProviderState>; update: Partial<ProviderState> }) => {
            const existing = state.providers.get(where.provider);
            const row = existing ? { ...existing, ...update, updatedAt: now } : { ...blankRow(where.provider), ...create };
            state.providers.set(where.provider, row);
            return { ...row };
        },
        update: async ({ where, data }: { where: { provider: string }; data: Partial<ProviderState> }) => {
            const existing = state.providers.get(where.provider);
            if (!existing) throw new Error('not found');
            const row = { ...existing, ...data, updatedAt: now };
            state.providers.set(where.provider, row);
            return { ...row };
        },
    };
    const userModel = {
        findMany: async () => state.users.map((u) => ({ ...u })),
        findUnique: async ({ where }: { where: { username: string } }) => {
            const user = state.users.find((u) => u.username === where.username);
            return user ? { ...user } : null;
        },
        findFirst: async ({ where }: { where: { email: string; isActive: boolean; isGroupUser: boolean; id: { not: number } } }) => {
            const user = state.users.find(
                (u) => (u.email ?? '').toLowerCase().trim() === where.email && u.isActive === where.isActive && u.isGroupUser === where.isGroupUser && u.id !== where.id.not,
            );
            return user ? { username: user.username, fullName: user.fullName } : null;
        },
        update: async ({ where, data }: { where: { id: number }; data: { email: string | null } }) => {
            const user = state.users.find((u) => u.id === where.id)!;
            user.email = data.email;
            return { ...user };
        },
    };
    const client = {
        integrationProvider: providerModel,
        user: userModel,
        $queryRaw: async () => [{ result: 0 }],
    };

    stubDelegate('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => {
        const snapshot = { providers: new Map([...state.providers].map(([k, v]) => [k, { ...v }])), users: state.users.map((u) => ({ ...u })) };
        try {
            return await fn(client);
        } catch (err) {
            state.providers = snapshot.providers;
            state.users = snapshot.users;
            throw err;
        }
    });
    stubDelegate('integrationProvider', providerModel);
    stubDelegate('user', userModel);
    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => {
        audits.push(entry);
    });
    mock.method(cacheService, 'invalidatePattern', async (pattern: string) => {
        invalidated.push(pattern);
    });
    let configs = seed.configs ?? followupConfigs([{ value: 'Call' }, { value: 'Meeting', meta: { icon: 'meeting' } }, { value: 'Task' }, { value: 'Note' }]);
    mock.method(formConfigService, 'getAllConfigs', async () => configs);
    mock.method(formConfigService, 'updateOption', async (id: string, body: { meta: Record<string, unknown> }) => {
        optionUpdates.push({ id, body });
        configs = {
            ...configs,
            categories: configs.categories.map((c) => ({ ...c, options: c.options.map((o) => (o.id === id ? { ...o, meta: body.meta } : o)) })),
        };
        return {};
    });
    mock.method(formConfigService, 'updateModuleSetting', async (module: string, key: string, body: { value: unknown }) => {
        settingSaves.push({ module, key, value: body.value });
        configs = { ...configs, moduleSettings: { ...configs.moduleSettings, activities: { [key]: body.value } } };
        return body.value;
    });
    return { state, audits, invalidated, optionUpdates, settingSaves };
}

const expectHttp = async (promise: Promise<unknown>, status: number, code?: string) => {
    await assert.rejects(promise, (err: unknown) => {
        assert.ok(err instanceof HttpError, `expected HttpError, got ${String(err)}`);
        assert.equal(err.statusCode, status);
        if (code) assert.equal(err.code, code);
        return true;
    });
};

describe('integrationService providers', () => {
    beforeEach(() => {
        configureSecretBox(parseKeyRing(`k1:${randomBytes(32).toString('base64')}`));
        dropProviderCredentialsCache();
    });
    afterEach(() => {
        mock.restoreAll();
        restoreDelegates();
        configureSecretBox(null);
    });

    it('stores the secret sealed, never returns it, and shows only its last 4 characters', async () => {
        const { state, audits } = setup();
        const dto = await integrationService.saveProvider('google', { clientId: 'abc.apps.googleusercontent.com', clientSecret: 'GOCSPX-supersecret-wxyz' }, admin, now);
        const json = JSON.stringify(dto);
        assert.ok(!json.includes('GOCSPX-supersecret'), 'secret leaked into the DTO');
        assert.equal(dto.secret.set, true);
        assert.equal(dto.secret.last4, 'wxyz');
        assert.equal(dto.secret.updatedBy, 'admin');
        assert.equal(dto.configured, true);
        assert.equal(dto.enabled, false);
        assert.equal(dto.redirectUri, 'http://localhost:8008/api/calendar-connections/oauth/google/callback');
        const row = state.providers.get('google')!;
        assert.match(row.secretsEnc!, /^enc:v1:k1:/);
        assert.equal(row.keyId, 'k1');
        assert.ok(!row.secretsEnc!.includes('supersecret'));
        assert.equal(JSON.parse(secretBox.open(row.secretsEnc!, 'IntegrationProvider:google:secrets')).clientSecret, 'GOCSPX-supersecret-wxyz');
        assert.equal(audits.length, 1);
        assert.equal(audits[0].action, 'CREATE');
        assert.equal(audits[0].entityType, 'IntegrationProvider');
        assert.equal((audits[0].changes as Record<string, unknown>).secretChanged, true);
        assert.ok(!JSON.stringify(audits).includes('supersecret'), 'secret leaked into the audit entry');
    });

    it('keeps the stored secret when a save omits it', async () => {
        const { state } = setup();
        await integrationService.saveProvider('google', { clientId: 'id-1', clientSecret: 'first-secret-1234' }, admin, now);
        const sealed = state.providers.get('google')!.secretsEnc;
        const dto = await integrationService.saveProvider('google', { settings: { scopeProfile: 'broad' } }, admin, now);
        assert.equal(state.providers.get('google')!.secretsEnc, sealed);
        assert.equal(dto.secret.last4, '1234');
        assert.deepEqual(dto.settings, { scopeProfile: 'broad', pkce: true });
    });

    it('refuses to enable without a client id and secret (409 INTEGRATION_NOT_CONFIGURED) and rolls back', async () => {
        const { state, audits } = setup();
        await expectHttp(integrationService.saveProvider('google', { enabled: true, clientId: 'only-id' }, admin, now), 409, 'INTEGRATION_NOT_CONFIGURED');
        assert.equal(state.providers.size, 0);
        assert.equal(audits.length, 0);
    });

    it('needs the Microsoft tenant before enabling, and validates it', async () => {
        setup();
        await expectHttp(integrationService.saveProvider('microsoft', { enabled: true, clientId: 'app-id', clientSecret: 'secret-value-1' }, admin, now), 400, 'VALIDATION_ERROR');
        await assert.rejects(integrationService.saveProvider('microsoft', { settings: { tenantId: 'https://evil.example/x' } }, admin, now));
        const dto = await integrationService.saveProvider(
            'microsoft',
            { enabled: true, clientId: 'app-id', clientSecret: 'secret-value-1', settings: { tenantId: '72F988BF-86F1-41AF-91AB-2D7CD011DB47' }, clientSecretExpiresOn: '2027-01-31' },
            admin,
            now,
        );
        assert.equal(dto.enabled, true);
        assert.equal(dto.settings.tenantId, '72f988bf-86f1-41af-91ab-2d7cd011db47');
        assert.equal(dto.secret.expiresOn, '2027-01-31');
    });

    it('refuses a secret while the encryption key is missing (503 INTEGRATIONS_NOT_READY)', async () => {
        setup();
        configureSecretBox(null);
        await expectHttp(integrationService.saveProvider('google', { clientId: 'id', clientSecret: 'secret-12345' }, admin, now), 503, 'INTEGRATIONS_NOT_READY');
    });

    it('bumps clientVersion when the client id or the Microsoft tenant changes, and clears the last test', async () => {
        const { state, audits } = setup();
        await integrationService.saveProvider('google', { clientId: 'id-1', clientSecret: 'secret-12345' }, admin, now);
        state.providers.get('google')!.lastTestAt = now;
        state.providers.get('google')!.lastTestOk = true;
        let dto = await integrationService.saveProvider('google', { clientId: 'id-2' }, admin, now);
        assert.equal(dto.clientVersion, 2);
        assert.equal(dto.lastTest, null);
        assert.deepEqual((audits.at(-1)!.changes as Record<string, unknown>).clientVersion, { from: 1, to: 2 });
        dto = await integrationService.saveProvider('google', { settings: { pkce: false } }, admin, now);
        assert.equal(dto.clientVersion, 2);

        await integrationService.saveProvider('microsoft', { clientId: 'app', clientSecret: 'secret-12345', settings: { tenantId: 'nandini.onmicrosoft.com' } }, admin, now);
        dto = await integrationService.saveProvider('microsoft', { settings: { tenantId: 'other.onmicrosoft.com' } }, admin, now);
        assert.equal(dto.clientVersion, 2);
    });

    it('keeps Zoom off until Phase 3 but stores its secrets, webhook secret included', async () => {
        setup();
        const dto = await integrationService.saveProvider('zoom', { clientId: 'zoom-id', clientSecret: 'zoom-secret-1', webhookSecret: 'zoom-hook-abcd' }, admin, now);
        assert.equal(dto.available, false);
        assert.equal(dto.webhookSecret?.last4, 'abcd');
        await expectHttp(integrationService.saveProvider('zoom', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_AVAILABLE');
        await expectHttp(integrationService.saveProvider('google', { webhookSecret: 'hook-secret-1' }, admin, now), 400);
    });

    it('shows an unreadable secret after a key change and refuses to enable until it is entered again', async () => {
        const { state } = setup();
        await integrationService.saveProvider('google', { clientId: 'id', clientSecret: 'secret-12345' }, admin, now);
        const sealed = state.providers.get('google')!.secretsEnc;
        configureSecretBox(parseKeyRing(`k2:${randomBytes(32).toString('base64')}`));
        const admin1 = await integrationService.getAdmin(now);
        assert.equal(admin1.keyStatus, 'unreadable');
        assert.equal(admin1.providers[0].secret.readable, false);
        assert.equal(admin1.providers[0].configured, false);
        await expectHttp(integrationService.saveProvider('google', { enabled: true }, admin, now), 409, 'INTEGRATION_NOT_CONFIGURED');
        // An unrelated save keeps the unreadable value (a key mix-up must not wipe it).
        await integrationService.saveProvider('google', { settings: { pkce: false } }, admin, now);
        assert.equal(state.providers.get('google')!.secretsEnc, sealed);
        const fixed = await integrationService.saveProvider('google', { clientSecret: 'secret-again', enabled: true }, admin, now);
        assert.equal(fixed.enabled, true);
        assert.equal(state.providers.get('google')!.keyId, 'k2');
    });

    it('clears secrets and switches the provider off', async () => {
        const { state, audits } = setup();
        await integrationService.saveProvider('google', { clientId: 'id', clientSecret: 'secret-12345', enabled: true }, admin, now);
        const dto = await integrationService.clearSecret('google', admin);
        assert.equal(dto.enabled, false);
        assert.equal(dto.secret.set, false);
        assert.equal(state.providers.get('google')!.secretsEnc, null);
        assert.deepEqual(audits.at(-1)!.changes, { secretCleared: true, enabled: { from: true, to: false } });
    });

    it('serves decrypted credentials to the connect flow, cached until the next save', async () => {
        setup();
        await integrationService.saveProvider('google', { clientId: 'id-1', clientSecret: 'secret-12345', enabled: true }, admin, now);
        const first = await loadProviderCredentials('google');
        assert.equal(first.clientSecret, 'secret-12345');
        assert.equal(first.enabled, true);
        assert.equal(first.configured, true);
        await integrationService.saveProvider('google', { enabled: false }, admin, now);
        assert.equal((await loadProviderCredentials('google')).enabled, false);
    });

    it('stores the test result and never sends a request without credentials', async () => {
        const { state } = setup();
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            return { status: 400, text: async () => JSON.stringify({ error: 'invalid_grant', error_description: 'Malformed auth code.' }) };
        };
        const missing = await integrationService.testProvider('google', fetchImpl, now);
        assert.equal(missing.code, 'not_configured');
        assert.equal(calls.length, 0);
        await integrationService.saveProvider('google', { clientId: 'id', clientSecret: 'secret-12345' }, admin, now);
        const result = await integrationService.testProvider('google', fetchImpl, now);
        assert.equal(result.ok, true);
        assert.equal(result.testedAt, now.toISOString());
        assert.equal(state.providers.get('google')!.lastTestOk, true);
        assert.match(state.providers.get('google')!.lastTestMessage!, /accepted/);
    });

    it('flags a client secret expiring within 30 days', () => {
        assert.equal(expiresSoon('2026-12-20', now), true);
        assert.equal(expiresSoon('2027-06-01', now), false);
        assert.equal(expiresSoon('2026-11-01', now), true);
        assert.equal(expiresSoon(null, now), false);
    });
});

describe('integrationService settings and sync types', () => {
    afterEach(() => {
        mock.restoreAll();
        restoreDelegates();
    });

    it('reads defaults when nothing is stored, and the meeting type from the option icon', async () => {
        setup({ configs: followupConfigs([{ value: 'Call' }, { value: 'Client Meeting', meta: { icon: 'meeting' } }]) });
        const settings = await loadCalendarSettings();
        assert.deepEqual(settings.companyDomains, ['nandiniinfosys.com']);
        assert.equal(settings.eventVisibility, 'private');
        assert.equal(settings.backfillDays, 60);
        assert.equal(settings.followUpActivities, true);
        assert.equal(settings.importFollowupType, 'Client Meeting');
    });

    it('reads a malformed stored value field by field', async () => {
        setup({ configs: followupConfigs([{ value: 'Call' }], { companyDomains: 'oops', backfillDays: 90, eventVisibility: 'default' }) });
        const settings = await loadCalendarSettings();
        assert.deepEqual(settings.companyDomains, ['nandiniinfosys.com']);
        assert.equal(settings.backfillDays, 90);
        assert.equal(settings.eventVisibility, 'default');
    });

    it('merges a partial update and saves the whole value through updateModuleSetting (which drops the form-config cache)', async () => {
        const { settingSaves } = setup();
        const saved = await saveCalendarSettings({ companyDomains: ['NandiniInfosys.com', 'nipl.in'], backfillDays: 30 }, admin);
        assert.deepEqual(saved.companyDomains, ['nandiniinfosys.com', 'nipl.in']);
        assert.equal(saved.backfillDays, 30);
        assert.equal(saved.eventVisibility, 'private');
        assert.equal(settingSaves.length, 1);
        assert.deepEqual(settingSaves[0], { module: 'activities', key: 'calendarSync', value: saved });
        await assert.rejects(saveCalendarSettings({ backfillDays: 45 }, admin));
        await assert.rejects(saveCalendarSettings({}, admin));
    });

    it('lists Followup Types with Task / Note locked off and a missing switch read as on', async () => {
        setup({ configs: followupConfigs([{ value: 'Call' }, { value: 'WhatsApp', meta: { calendarSync: false } }, { value: 'Task' }, { value: 'Old', isActive: false }]) });
        assert.deepEqual(await integrationService.getSyncTypes(), [
            { value: 'Call', label: 'Call', calendarSync: true, locked: false },
            { value: 'WhatsApp', label: 'WhatsApp', calendarSync: false, locked: false },
            { value: 'Task', label: 'Task', calendarSync: false, locked: true, lockReason: 'Tasks and notes never go to calendars.' },
        ]);
    });

    it('merges calendarSync into option meta through the option update, only for real changes', async () => {
        const { optionUpdates, invalidated } = setup({ configs: followupConfigs([{ value: 'Call', meta: { icon: 'call' } }, { value: 'Email' }, { value: 'Task' }]) });
        const types = await integrationService.saveSyncTypes({ Call: false, email: true, Task: false }, admin);
        assert.deepEqual(optionUpdates, [{ id: 'opt-Call', body: { meta: { icon: 'call', calendarSync: false } } }]);
        assert.equal(types.find((t) => t.value === 'Call')!.calendarSync, false);
        assert.ok(invalidated.some((p) => p.includes('form-configs')));
    });

    it('refuses Task / Note on and unknown types', async () => {
        setup();
        await expectHttp(integrationService.saveSyncTypes({ Note: true }, admin), 400);
        await expectHttp(integrationService.saveSyncTypes({ Fax: true }, admin), 400);
    });
});

describe('People and company emails', () => {
    afterEach(() => {
        mock.restoreAll();
        restoreDelegates();
    });

    const users: UserState[] = [
        { id: 1, username: 'asha', fullName: 'Asha Rao', department: 'Sales', role: 'Sales Executive', email: 'asha@nandiniinfosys.com', isActive: true, isGroupUser: false },
        { id: 2, username: 'ravi', fullName: 'Ravi', department: 'Sales', role: 'Sales Executive', email: 'Shared@NandiniInfosys.com', isActive: true, isGroupUser: false },
        { id: 3, username: 'mohan', fullName: 'Mohan', department: null, role: 'Sales Executive', email: 'shared@nandiniinfosys.com ', isActive: true, isGroupUser: false },
        { id: 4, username: 'support', fullName: 'Support Desk', department: null, role: 'Support', email: 'asha@nandiniinfosys.com', isActive: true, isGroupUser: true },
        { id: 5, username: 'old', fullName: 'Old User', department: null, role: 'Sales Executive', email: 'asha@nandiniinfosys.com', isActive: false, isGroupUser: false },
        { id: 6, username: 'gmail', fullName: 'Gmail User', department: null, role: 'Sales Executive', email: 'someone@gmail.com', isActive: true, isGroupUser: false },
        { id: 7, username: 'none', fullName: '', department: null, role: 'Sales Executive', email: null, isActive: true, isGroupUser: false },
    ];

    it('lists active non-group users with missing / duplicate / not_company flags (group and inactive users ignored)', () => {
        const people = peopleFrom(users, ['nandiniinfosys.com']);
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
        assert.deepEqual(
            peopleFrom(users, ['nandiniinfosys.com'], { issue: 'any' }).map((p) => p.username),
            ['ravi', 'mohan', 'gmail', 'none'],
        );
        assert.deepEqual(
            peopleFrom(users, ['nandiniinfosys.com'], { search: 'RAO' }).map((p) => p.username),
            ['asha'],
        );
    });

    it('saves a lower-cased company email, audited, and drops the user directory cache', async () => {
        const { state, audits, invalidated } = setup({ users });
        const person = await integrationService.setPersonEmail('none', { email: '  New.Person@NandiniInfosys.com ' }, admin);
        assert.equal(person.email, 'new.person@nandiniinfosys.com');
        assert.equal(person.emailIssue, null);
        assert.equal(state.users.find((u) => u.username === 'none')!.email, 'new.person@nandiniinfosys.com');
        assert.deepEqual(audits.at(-1), {
            entityType: 'User',
            entityId: '7',
            action: 'UPDATE',
            changedBy: 'admin',
            changes: { email: { from: null, to: 'new.person@nandiniinfosys.com' } },
        });
        assert.ok(invalidated.includes('cache:lookups:users*'));
    });

    it('refuses an address another active user holds (409 DUPLICATE_RECORD), but a group login may share it', async () => {
        const { state } = setup({ users });
        await expectHttp(integrationService.setPersonEmail('none', { email: 'ASHA@nandiniinfosys.com' }, admin), 409, 'DUPLICATE_RECORD');
        assert.equal(state.users.find((u) => u.username === 'none')!.email, null);
        // The group login 'support' and the inactive 'old' hold asha@ too, and don't count.
        await integrationService.setPersonEmail('gmail', { email: 'gmail.user@nandiniinfosys.com' }, admin);
    });

    it('refuses another domain unless allowed, and clears with a blank value', async () => {
        const { state } = setup({ users });
        await expectHttp(integrationService.setPersonEmail('none', { email: 'x@vendor.com' }, admin), 400, 'VALIDATION_ERROR');
        const allowed = await integrationService.setPersonEmail('none', { email: 'x@vendor.com', allowOtherDomain: true }, admin);
        assert.equal(allowed.emailIssue, 'not_company');
        await integrationService.setPersonEmail('none', { email: '   ' }, admin);
        assert.equal(state.users.find((u) => u.username === 'none')!.email, null);
        await expectHttp(integrationService.setPersonEmail('nobody', { email: 'a@nandiniinfosys.com' }, admin), 404);
        await assert.rejects(integrationService.setPersonEmail('none', { email: 'not an email' }, admin));
    });

    it('writes nothing for an unchanged address', async () => {
        const { audits, invalidated } = setup({ users });
        await userEmailService.setEmail('asha', { email: 'asha@nandiniinfosys.com' }, { companyDomains: ['nandiniinfosys.com'], actor: admin });
        assert.equal(audits.length, 0);
        assert.equal(invalidated.length, 0);
    });
});
