import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pre-deploy check for the calendar_connections migration (Calendar Phase 2 P2-2):
 *
 *   npm run calendar:check-emails
 *
 * Lists company emails held by more than one ACTIVE, NON-GROUP user, the same rule as the migration's guard and its
 * UX_Users_email index (group / shared logins and inactive users don't count). Compared trimmed and lower-cased,
 * which is what the migration stores. Exit code 0 = "No duplicates" (safe to deploy); 1 = duplicates listed (fix them
 * on Admin › API Integrations › People first). Reads only; prints usernames and addresses, nothing else.
 *
 * SQL equivalent:
 *   SELECT LOWER(LTRIM(RTRIM(email))), COUNT(*) FROM Users
 *   WHERE email IS NOT NULL AND LTRIM(RTRIM(email)) <> '' AND isActive = 1 AND isGroupUser = 0
 *   GROUP BY LOWER(LTRIM(RTRIM(email))) HAVING COUNT(*) > 1
 *
 * If the migration stops anyway (Prisma P3009 on the next deploy): fix the users, then run
 *   npx prisma migrate resolve --rolled-back 20261127090000_calendar_connections
 * and deploy again.
 */

export interface EmailRuleUser {
    username: string;
    email: string | null;
    isActive: boolean;
    isGroupUser: boolean;
}

/** Address → usernames, for addresses held by more than one active, non-group user. Pure. */
export function duplicateEmailHolders(users: readonly EmailRuleUser[]): Map<string, string[]> {
    const holders = new Map<string, string[]>();
    for (const user of users) {
        if (!user.isActive || user.isGroupUser) continue;
        const email = (user.email ?? '').trim().toLowerCase();
        if (!email) continue;
        holders.set(email, [...(holders.get(email) ?? []), user.username]);
    }
    return new Map([...holders].filter(([, names]) => names.length > 1).sort(([a], [b]) => a.localeCompare(b)));
}

/** The report lines and exit code. Pure. */
export function emailCheckReport(users: readonly EmailRuleUser[]): { lines: string[]; exitCode: number } {
    const duplicates = duplicateEmailHolders(users);
    if (duplicates.size === 0) return { lines: ['No duplicates: every active, non-group user has a unique email (or none).'], exitCode: 0 };
    const lines = [`${duplicates.size} email address(es) are used by more than one active user:`];
    for (const [email, names] of duplicates) lines.push(`  ${email}: ${names.join(', ')}`);
    lines.push('Fix them on Admin › API Integrations › People (group / shared logins may keep a shared address), then run this again.');
    return { lines, exitCode: 1 };
}

async function main(): Promise<void> {
    const { prisma } = await import('../src/config/prisma.js');
    try {
        const users = await prisma.user.findMany({ select: { username: true, email: true, isActive: true, isGroupUser: true } });
        const { lines, exitCode } = emailCheckReport(users);
        for (const line of lines) console.log(line);
        process.exitCode = exitCode;
    } finally {
        await prisma.$disconnect();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err: Error) => {
        console.error(`Email check failed: ${err.message}`);
        process.exit(1);
    });
}
