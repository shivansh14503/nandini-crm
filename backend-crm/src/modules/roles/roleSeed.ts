import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { GLOBAL_ACCESS_ROLES, LEGACY_ADMIN_ROLES, legacyRole, normalizeRole, SUPER_ADMIN_ROLE } from './roleDefaults.js';
import { refresh } from './roleRegistry.js';

/**
 * Start-up seeding of Admin › Roles (never overwrites a saved role):
 *   - an empty table (first start after the roles migration) gets a row for every role users hold plus the roles that
 *     opened the admin panel or saw every record, each with the access its name gave before, so nobody's access changes;
 *   - afterwards, only Super Admin (always present, locked) and any role a user holds that no row matches (a user
 *     written straight into the database) are added. A role an admin deleted is not brought back.
 * The pure part, `rolesToSeed`, is unit tested.
 */

export interface SeedRole {
    name: string;
    adminPanel: boolean;
    permissionsJson: string;
    isSystem: boolean;
    description: string | null;
}

const DESCRIPTIONS: Record<string, string> = {
    [normalizeRole(SUPER_ADMIN_ROLE)]: 'Full access to every module and admin page. Only Super Admins can manage Super Admin users.',
};

/** The rows to insert, given the role names in the table and the role names users hold. Pure. */
export function rolesToSeed(existing: readonly string[], held: readonly string[]): SeedRole[] {
    const known = new Set(existing.map(normalizeRole));
    const candidates = existing.length === 0 ? [SUPER_ADMIN_ROLE, ...LEGACY_ADMIN_ROLES, ...GLOBAL_ACCESS_ROLES, ...held] : [SUPER_ADMIN_ROLE, ...held];
    const out: SeedRole[] = [];
    for (const raw of candidates) {
        const name = raw.trim().replace(/\s+/g, ' ');
        const key = normalizeRole(name);
        if (!name || known.has(key)) continue;
        known.add(key);
        const role = legacyRole(name);
        out.push({
            name: name.slice(0, 50),
            adminPanel: role.adminPanel,
            permissionsJson: JSON.stringify(role.permissions),
            isSystem: role.superAdmin,
            description: DESCRIPTIONS[key] ?? null,
        });
    }
    return out;
}

export async function seedRoles(): Promise<number> {
    const [existing, held] = await Promise.all([
        prisma.role.findMany({ select: { name: true } }),
        prisma.user.findMany({ distinct: ['role'], select: { role: true } }),
    ]);
    const rows = rolesToSeed(
        existing.map((r) => r.name),
        held.map((u) => u.role),
    );
    for (const row of rows) {
        await prisma.role.create({ data: { ...row, createdBy: 'system', updatedBy: 'system' } }).catch((err: Error) => {
            // Another instance seeding at the same moment: its row wins.
            logger.warn({ role: row.name, err: err.message }, 'Role seed row skipped');
        });
    }
    if (rows.length) logger.info({ roles: rows.map((r) => r.name) }, 'Seeded Admin › Roles');
    await refresh();
    return rows.length;
}

/** Start-up wrapper: a failure is logged, never fatal (access falls back to the role names' old rules). */
export async function seedRolesSafely(): Promise<void> {
    try {
        await seedRoles();
    } catch (err) {
        logger.error({ err: (err as Error).message }, 'Seeding Admin › Roles failed');
    }
}
