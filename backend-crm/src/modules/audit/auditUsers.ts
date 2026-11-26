import { displayTime } from './audit.format.js';
import { actionLabel, moduleLabel } from './auditAdmin.present.js';
import { photoUrlOf } from '../profile/profile.dto.js';

/**
 * Admin › Audit Log › Users: one row per person who can appear in the log, with what they did in the chosen range
 * and when they were last active. Pure (unit tested in auditUsers.test.ts); the service reads the rows.
 */

/** The `Users` columns the tab shows. */
export interface DirectoryUser {
    username: string;
    fullName: string;
    role: string;
    department: string | null;
    email: string | null;
    isActive: boolean;
    isGroupUser: boolean;
    onLeave: boolean;
    lastLoginAt: Date | null;
    /** Only the profile photo's id (never the bytes); absent or null when the user has none. */
    photo?: { id: string } | null;
}

/** Entries of one user and category in the range. */
export interface UserRangeRow {
    changedBy: string;
    category: string;
    count: number;
    signIns: number;
    failedSignIns: number;
}

/** A user's newest entry, any time. */
export interface UserLastRow {
    username: string;
    lastAt: Date | null;
    action: string | null;
    module: string | null;
}

/**
 * `active` / `inactive`: a CRM user. `system`: the background jobs. `unknown`: entries under a username that isn't in
 * the user list any more.
 */
export type AuditUserStatus = 'active' | 'inactive' | 'system' | 'unknown';

export interface AuditUserActivity {
    username: string;
    name: string;
    role: string | null;
    department: string | null;
    email: string | null;
    status: AuditUserStatus;
    onLeave: boolean;
    isGroupUser: boolean;
    /** `/api/user-photos/<id>`; null when the user has no photo (and for `system` / `unknown`). */
    photoUrl: string | null;
    lastLoginAt: string | null;
    /** In the business timezone. */
    lastLogin: string | null;
    lastActivityAt: string | null;
    lastActivity: string | null;
    /** What the newest entry was, e.g. `Updated · Leads`. */
    lastActivityLabel: string | null;
    /** Entries in the range, in total and per category. */
    total: number;
    data: number;
    config: number;
    security: number;
    signIns: number;
    failedSignIns: number;
}

export const SYSTEM_USER = 'system';

const key = (username: string) => username.toLowerCase();

/** Every username whose newest entry is looked up: the user list, the background jobs and anyone else active in the range. */
export function activityUsernames(directory: DirectoryUser[], rangeRows: UserRangeRow[]): string[] {
    const names = new Map<string, string>();
    for (const user of directory) names.set(key(user.username), user.username);
    names.set(SYSTEM_USER, SYSTEM_USER);
    for (const row of rangeRows) if (!names.has(key(row.changedBy))) names.set(key(row.changedBy), row.changedBy);
    return [...names.values()];
}

/**
 * One row per user: everyone in the user list (group accounts only when they did something), the background jobs
 * once they have entries, and usernames with entries in the range that aren't users any more. Most active first,
 * then the most recently active, then by name.
 */
export function buildUserActivity(
    directory: DirectoryUser[],
    rangeRows: UserRangeRow[],
    lastRows: UserLastRow[],
    format: (date: Date) => string = displayTime,
): AuditUserActivity[] {
    const counts = new Map<string, Pick<AuditUserActivity, 'total' | 'data' | 'config' | 'security' | 'signIns' | 'failedSignIns'>>();
    const rangeNames = new Map<string, string>();
    for (const row of rangeRows) {
        const k = key(row.changedBy);
        rangeNames.set(k, rangeNames.get(k) ?? row.changedBy);
        const c = counts.get(k) ?? { total: 0, data: 0, config: 0, security: 0, signIns: 0, failedSignIns: 0 };
        const n = Number(row.count);
        c.total += n;
        if (row.category === 'DATA') c.data += n;
        else if (row.category === 'CONFIG') c.config += n;
        else if (row.category === 'SECURITY') c.security += n;
        c.signIns += Number(row.signIns);
        c.failedSignIns += Number(row.failedSignIns);
        counts.set(k, c);
    }
    const last = new Map(lastRows.map((row) => [key(row.username), row]));

    const result: AuditUserActivity[] = [];
    const seen = new Set<string>();
    const add = (base: Omit<AuditUserActivity, 'lastActivityAt' | 'lastActivity' | 'lastActivityLabel' | 'total' | 'data' | 'config' | 'security' | 'signIns' | 'failedSignIns'>) => {
        const k = key(base.username);
        seen.add(k);
        const newest = last.get(k);
        const lastAt = newest?.lastAt ?? null;
        result.push({
            ...base,
            lastActivityAt: lastAt ? lastAt.toISOString() : null,
            lastActivity: lastAt ? format(lastAt) : null,
            lastActivityLabel: lastAt && newest?.action ? [actionLabel(newest.action), newest.module ? moduleLabel(newest.module) : null].filter(Boolean).join(' · ') : null,
            ...(counts.get(k) ?? { total: 0, data: 0, config: 0, security: 0, signIns: 0, failedSignIns: 0 }),
        });
    };

    for (const user of directory) {
        const k = key(user.username);
        if (k === SYSTEM_USER || seen.has(k)) continue;
        if (user.isGroupUser && !counts.has(k) && !last.get(k)?.lastAt) continue;
        add({
            username: user.username,
            name: user.fullName.trim() || user.username,
            role: user.role || null,
            department: user.department,
            email: user.email,
            status: user.isActive ? 'active' : 'inactive',
            onLeave: user.onLeave,
            isGroupUser: user.isGroupUser,
            photoUrl: photoUrlOf(user.photo?.id),
            lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
            lastLogin: user.lastLoginAt ? format(user.lastLoginAt) : null,
        });
    }
    if (counts.has(SYSTEM_USER) || last.get(SYSTEM_USER)?.lastAt) {
        add({ username: SYSTEM_USER, name: 'System', role: 'Background jobs', department: null, email: null, status: 'system', onLeave: false, isGroupUser: false, photoUrl: null, lastLoginAt: null, lastLogin: null });
    }
    for (const [k, username] of rangeNames) {
        if (seen.has(k)) continue;
        add({ username, name: username, role: null, department: null, email: null, status: 'unknown', onLeave: false, isGroupUser: false, photoUrl: null, lastLoginAt: null, lastLogin: null });
    }

    return result.sort(
        (a, b) => b.total - a.total || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name),
    );
}
