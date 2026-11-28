import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma.js';
import { loginRateLimit } from '../../middlewares/rateLimiter.js';
import { auditService, type AuditEntry } from '../../services/audit.service.js';
import { HttpError } from '../../utils/httpError.js';
import { authService } from './auth.service.js';
import { sessionService } from './session.service.js';

/** Sign-in with account lockout, on a User double over the real Prisma client (restored after each test). */
interface Row {
    id: number;
    username: string;
    role: string;
    passwordHash: string;
    isActive: boolean;
    invitePending: boolean;
    failedLoginCount: number;
    lastFailedLoginAt: Date | null;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
}

let row: Row;
let audits: AuditEntry[];
const real = new Map<string, unknown>();

function stub(name: string, fake: unknown) {
    const client = prisma as unknown as Record<string, unknown>;
    if (!real.has(name)) real.set(name, client[name]);
    Object.defineProperty(client, name, { value: fake, configurable: true, writable: true });
}

const pick = (select?: Record<string, unknown>) => {
    if (!select) return { ...row, photo: null };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) out[key] = key === 'photo' ? null : (row as unknown as Record<string, unknown>)[key];
    return out;
};

beforeEach(async () => {
    audits = [];
    row = {
        id: 5,
        username: 'asha.k',
        role: 'Sales Executive',
        passwordHash: await bcrypt.hash('Right2026', 4),
        isActive: true,
        invitePending: false,
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: null,
        fullName: 'Asha Kapoor',
        firstName: 'Asha',
        lastName: 'Kapoor',
    };
    const user = {
        findUnique: async ({ select }: { select?: Record<string, unknown> }) => pick(select),
        update: async ({ data, select }: { data: Partial<Row>; select?: Record<string, unknown> }) => {
            Object.assign(row, data);
            return pick(select);
        },
    };
    stub('user', user);
    stub('$transaction', async (fn: (tx: unknown) => Promise<unknown>) => fn({ user, $queryRaw: async () => [{ result: 0 }] }));
    mock.method(auditService, 'record', async (_tx: unknown, entry: AuditEntry) => void audits.push(entry));
    mock.method(auditService, 'enqueue', async (entry: AuditEntry) => void audits.push(entry));
    mock.method(loginRateLimit, 'recordFailure', async () => undefined);
    mock.method(loginRateLimit, 'reset', async () => undefined);
    mock.method(sessionService, 'create', async () => false);
});

afterEach(() => {
    for (const [name, value] of real) Object.defineProperty(prisma, name, { value, configurable: true, writable: true });
    real.clear();
    mock.restoreAll();
});

const signIn = (password: string) => authService.loginUser({ username: 'asha.k', password }, { ip: '10.0.0.9' });
const isCode = (code: string) => (err: unknown) => err instanceof HttpError && err.code === code;

describe('sign-in with account lockout', () => {
    it('locks the account on the fifth wrong password and audits it once', async () => {
        for (let i = 1; i <= 4; i++) {
            await assert.rejects(signIn('wrong'), isCode('INVALID_CREDENTIALS'));
            assert.equal(row.failedLoginCount, i);
        }
        await assert.rejects(signIn('wrong'), (err: unknown) => isCode('ACCOUNT_LOCKED')(err) && (err as HttpError).statusCode === 423 && /15 more minutes/.test((err as Error).message));
        assert.ok(row.lockedUntil && row.lockedUntil.getTime() > Date.now());
        assert.equal(row.failedLoginCount, 0);
        const locked = audits.filter((a) => a.action === 'ACCOUNT_LOCKED');
        assert.equal(locked.length, 1);
        assert.equal((locked[0].changes as Record<string, unknown>).failedAttempts, 5);
    });

    it('refuses even the right password while locked, without counting it', async () => {
        row.lockedUntil = new Date(Date.now() + 10 * 60_000);
        await assert.rejects(signIn('Right2026'), isCode('ACCOUNT_LOCKED'));
        assert.equal(row.lastLoginAt, null);
        assert.equal((audits.at(-1)?.changes as Record<string, unknown>).reason, 'Account locked');
    });

    it('lets the user in once the lock has passed, and a sign-in clears the count', async () => {
        Object.assign(row, { lockedUntil: new Date(Date.now() - 1000), failedLoginCount: 3, lastFailedLoginAt: new Date() });
        const result = await signIn('Right2026');
        assert.equal(result.user.username, 'asha.k');
        assert.equal(row.failedLoginCount, 0);
        assert.equal(row.lockedUntil, null);
        assert.equal(row.lastFailedLoginAt, null);
    });
});
