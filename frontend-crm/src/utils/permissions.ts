/**
 * Role permissions (Admin › Roles): what a role may do in each CRM module. Pure and dependency-free. The signed-in
 * user's set comes with them (`user.access`, GET /api/auth/me); `usePermissions` reads it to hide what the role can't do.
 *
 * Every module has six actions (View, Create, Edit, Delete, Export, Import), each set to a level:
 *   - `all`  every record (for Create / Export / Import: allowed)
 *   - `group` records owned (`assignedTo`) or created by anyone who shares a security group with the user (Admin ›
 *            Security Groups; a parent group's members also see its sub-groups' records); offered where `own` is
 *   - `own`  only records the user owns (`assignedTo`) or created; offered only by modules whose records have an owner
 *   - `none` not allowed
 * A module only lists the actions it has (Documents are read-only, only Partner Companies export today).
 *
 * Mirrors backend-crm/src/modules/roles/permissions.ts; backend-crm/src/validators/contractSync.test.ts checks the two
 * agree, so change both together.
 */

export const ACCESS_LEVELS = ['all', 'group', 'own', 'none'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'import'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
    view: 'View',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    export: 'Export',
    import: 'Import',
};

/** Actions that are simply allowed or not (no "own records" / "group records" level). */
export const YES_NO_ACTIONS: ReadonlySet<PermissionAction> = new Set(['create', 'export', 'import']);

export const PERMISSION_MODULE_KEYS = [
    'leads',
    'contacts',
    'organizations',
    'opportunities',
    'quotations',
    'contracts',
    'tickets',
    'referrals',
    'activities',
    'documents',
    'products',
    'partnerCompanies',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULE_KEYS)[number];

export interface PermissionModuleDef {
    key: PermissionModule;
    label: string;
    /** Records have an owner (`assignedTo` / `createdBy`), so View / Edit / Delete can be limited to "Group" or "Own". */
    owned: boolean;
    /** The actions this module has, in column order. */
    actions: readonly PermissionAction[];
}

const CRUD: readonly PermissionAction[] = ['view', 'create', 'edit', 'delete'];
const CRUD_IMPORT: readonly PermissionAction[] = [...CRUD, 'import'];

export const PERMISSION_MODULES: readonly PermissionModuleDef[] = [
    { key: 'leads', label: 'Leads', owned: true, actions: CRUD_IMPORT },
    { key: 'contacts', label: 'Contacts', owned: true, actions: CRUD_IMPORT },
    { key: 'organizations', label: 'Organizations', owned: true, actions: CRUD_IMPORT },
    { key: 'opportunities', label: 'Opportunities', owned: true, actions: CRUD_IMPORT },
    { key: 'quotations', label: 'Quotations', owned: true, actions: CRUD },
    { key: 'contracts', label: 'Contracts', owned: true, actions: CRUD },
    { key: 'tickets', label: 'Tickets', owned: true, actions: CRUD_IMPORT },
    { key: 'referrals', label: 'Referrals', owned: true, actions: CRUD },
    { key: 'activities', label: 'Activities', owned: true, actions: CRUD },
    // Read-only list: documents are written by the opportunity form; ownership follows the opportunity.
    { key: 'documents', label: 'Documents', owned: true, actions: ['view'] },
    { key: 'products', label: 'Products', owned: false, actions: CRUD_IMPORT },
    { key: 'partnerCompanies', label: 'Partner Companies', owned: false, actions: [...CRUD, 'export', 'import'] },
];

export const PERMISSION_MODULE_BY_KEY: Readonly<Record<PermissionModule, PermissionModuleDef>> = Object.fromEntries(
    PERMISSION_MODULES.map((m) => [m.key, m]),
) as Record<PermissionModule, PermissionModuleDef>;

export type ModulePermissions = Partial<Record<PermissionAction, AccessLevel>>;
export type RolePermissions = Record<PermissionModule, ModulePermissions>;

const RANK: Record<AccessLevel, number> = { none: 0, own: 1, group: 2, all: 3 };
const isLevel = (value: unknown): value is AccessLevel => typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value);

/** The levels the editor offers for one action of one module. */
export function levelsFor(module: PermissionModuleDef, action: PermissionAction): readonly AccessLevel[] {
    if (YES_NO_ACTIONS.has(action) || !module.owned) return ['all', 'none'];
    return ACCESS_LEVELS;
}

/** The lower of two levels. */
export function minLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
    return RANK[a] <= RANK[b] ? a : b;
}

/**
 * A complete, consistent permission set from anything (stored JSON, a request body): every module and action is
 * present; an unknown or missing value is `none`; `own` / `group` become `all` where the action has no such level; and
 * nothing goes beyond View (a module that can't be viewed allows nothing, Edit / Delete never exceed View).
 */
export function normalizePermissions(input: unknown): RolePermissions {
    const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const result = {} as RolePermissions;
    for (const def of PERMISSION_MODULES) {
        const raw = (source[def.key] && typeof source[def.key] === 'object' ? source[def.key] : {}) as Record<string, unknown>;
        const out: ModulePermissions = {};
        for (const action of def.actions) {
            const value = raw[action];
            let level: AccessLevel = isLevel(value) ? value : 'none';
            if ((level === 'own' || level === 'group') && !levelsFor(def, action).includes(level)) level = 'all';
            out[action] = level;
        }
        const view = out.view ?? 'none';
        for (const action of def.actions) {
            if (action === 'view') continue;
            const level = out[action] ?? 'none';
            if (view === 'none') out[action] = 'none';
            else if (action === 'edit' || action === 'delete') out[action] = minLevel(level, view);
        }
        result[def.key] = out;
    }
    return result;
}

/** Every action on every module at `level` (`own` / `group` only where offered, else `all`). */
export function uniformPermissions(level: AccessLevel): RolePermissions {
    const raw: Record<string, Record<string, AccessLevel>> = {};
    for (const def of PERMISSION_MODULES) {
        raw[def.key] = {};
        for (const action of def.actions) {
            raw[def.key][action] = (level === 'own' || level === 'group') && !levelsFor(def, action).includes(level) ? 'all' : level;
        }
    }
    return normalizePermissions(raw);
}

/** Full access: every action on every record (Super Admin, and roles that saw everything before Admin › Roles). */
export const FULL_PERMISSIONS: RolePermissions = uniformPermissions('all');
/**
 * Own records only, creating and importing allowed: every other role before Admin › Roles. Referrals were listed to
 * everyone (only editing and deleting were limited to their owner), so their View stays All.
 */
export const OWN_RECORDS_PERMISSIONS: RolePermissions = normalizePermissions({
    ...uniformPermissions('own'),
    referrals: { ...uniformPermissions('own').referrals, view: 'all' },
});

/** The level `permissions` give `action` on `module` (`none` for an action the module doesn't have). */
export function levelOf(permissions: RolePermissions, module: PermissionModule, action: PermissionAction): AccessLevel {
    return permissions[module]?.[action] ?? 'none';
}

/** Whether the two permission sets are the same after normalizing. */
export function samePermissions(a: unknown, b: unknown): boolean {
    return JSON.stringify(normalizePermissions(a)) === JSON.stringify(normalizePermissions(b));
}

/** How the editor names a level: Yes / No for Create, Export and Import; All / Group / Own / None otherwise. */
export function levelLabel(action: PermissionAction, level: AccessLevel): string {
    if (YES_NO_ACTIONS.has(action)) return level === 'none' ? 'No' : 'Yes';
    return level === 'all' ? 'All' : level === 'group' ? 'Group' : level === 'own' ? 'Own' : 'None';
}

/** Readable audit text for one module's levels, e.g. "View: All · Create: Yes · Edit: Own · Delete: None". */
export function describeModulePermissions(module: PermissionModuleDef, permissions: ModulePermissions): string {
    return module.actions.map((action) => `${PERMISSION_ACTION_LABELS[action]}: ${levelLabel(action, permissions[action] ?? 'none')}`).join(' · ');
}

export type RoleAccessSummary = 'admin' | 'all-records' | 'own-records' | 'custom';

/**
 * One-word summary of a role for lists and badges: `admin` (opens the admin panel), `all-records` (views every record
 * of every module), `own-records` (views as roles did before Admin › Roles: own records, every referral, product and
 * partner company), else `custom`.
 */
export function accessSummary(adminPanel: boolean, permissions: RolePermissions): RoleAccessSummary {
    if (adminPanel) return 'admin';
    if (PERMISSION_MODULES.every((m) => permissions[m.key].view === 'all')) return 'all-records';
    if (PERMISSION_MODULES.every((m) => permissions[m.key].view === OWN_RECORDS_PERMISSIONS[m.key].view)) return 'own-records';
    return 'custom';
}

/** Owner columns a record may carry (records without them count as not owned). */
export interface OwnedRecord {
    assignedTo?: string | null;
    createdBy?: string | null;
}

const sameUser = (a: string | null | undefined, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Whether `level` lets `username` act on `record` (All: any; Group: owned or created by anyone in `teammates`, the
 * users who share a security group with them, themselves included; Own: their own or created; None: never).
 */
export function levelAllowsRecord(
    level: AccessLevel,
    username: string,
    record: OwnedRecord | null | undefined,
    teammates: readonly string[] = [],
): boolean {
    if (level === 'all') return true;
    if (level === 'none' || !record) return false;
    if (sameUser(record.assignedTo, username) || sameUser(record.createdBy, username)) return true;
    return level === 'group' && teammates.some((mate) => sameUser(record.assignedTo, mate) || sameUser(record.createdBy, mate));
}
