/**
 * Role permissions (Admin › Roles): what a role may do in each CRM module. Pure and dependency-free.
 *
 * Every module has six actions (View, Create, Edit, Delete, Export, Import), each set to a level:
 *   - `all`  every record (for Create / Export / Import: allowed)
 *   - `own`  only records the user owns (`assignedTo`) or created; offered only by modules whose records have an owner
 *   - `none` not allowed
 * A module only lists the actions it has: every module exports (CSV of the list); Documents are read-only (View and
 * Export only), every other module also has Create, Edit, Delete and Import.
 *
 * Mirrors frontend-crm/src/utils/permissions.ts; src/validators/contractSync.test.ts checks the two agree, so change
 * both together.
 */

export const ACCESS_LEVELS = ['all', 'own', 'none'] as const;
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

/** Actions that are simply allowed or not (no "own records" level). */
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
    /** Records have an owner (`assignedTo` / `createdBy`), so View / Edit / Delete can be limited to "Own". */
    owned: boolean;
    /** The actions this module has, in column order. */
    actions: readonly PermissionAction[];
}

const CRUD: readonly PermissionAction[] = ['view', 'create', 'edit', 'delete'];
/** View, Create, Edit, Delete, Export and Import: what every module but Documents has. */
const ALL_ACTIONS: readonly PermissionAction[] = [...CRUD, 'export', 'import'];

export const PERMISSION_MODULES: readonly PermissionModuleDef[] = [
    { key: 'leads', label: 'Leads', owned: true, actions: ALL_ACTIONS },
    { key: 'contacts', label: 'Contacts', owned: true, actions: ALL_ACTIONS },
    { key: 'organizations', label: 'Organizations', owned: true, actions: ALL_ACTIONS },
    { key: 'opportunities', label: 'Opportunities', owned: true, actions: ALL_ACTIONS },
    { key: 'quotations', label: 'Quotations', owned: true, actions: ALL_ACTIONS },
    { key: 'contracts', label: 'Contracts', owned: true, actions: ALL_ACTIONS },
    { key: 'tickets', label: 'Tickets', owned: true, actions: ALL_ACTIONS },
    { key: 'referrals', label: 'Referrals', owned: true, actions: ALL_ACTIONS },
    { key: 'activities', label: 'Activities', owned: true, actions: ALL_ACTIONS },
    // Read-only list: documents are written by the opportunity form; ownership follows the opportunity.
    { key: 'documents', label: 'Documents', owned: true, actions: ['view', 'export'] },
    { key: 'products', label: 'Products', owned: false, actions: ALL_ACTIONS },
    { key: 'partnerCompanies', label: 'Partner Companies', owned: false, actions: ALL_ACTIONS },
];

export const PERMISSION_MODULE_BY_KEY: Readonly<Record<PermissionModule, PermissionModuleDef>> = Object.fromEntries(
    PERMISSION_MODULES.map((m) => [m.key, m]),
) as Record<PermissionModule, PermissionModuleDef>;

export type ModulePermissions = Partial<Record<PermissionAction, AccessLevel>>;
export type RolePermissions = Record<PermissionModule, ModulePermissions>;

const RANK: Record<AccessLevel, number> = { none: 0, own: 1, all: 2 };
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
 * present; an unknown or missing value is `none`; `own` becomes `all` where the action has no "own" level; and
 * nothing goes beyond View (a module that can't be viewed allows nothing, Edit / Delete never exceed View).
 */
export function normalizePermissions(input: unknown): RolePermissions {
    const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const result = {} as RolePermissions;
    for (const module of PERMISSION_MODULES) {
        const raw = (source[module.key] && typeof source[module.key] === 'object' ? source[module.key] : {}) as Record<string, unknown>;
        const out: ModulePermissions = {};
        for (const action of module.actions) {
            const value = raw[action];
            let level: AccessLevel = isLevel(value) ? value : 'none';
            if (level === 'own' && !levelsFor(module, action).includes('own')) level = 'all';
            out[action] = level;
        }
        const view = out.view ?? 'none';
        for (const action of module.actions) {
            if (action === 'view') continue;
            const level = out[action] ?? 'none';
            if (view === 'none') out[action] = 'none';
            else if (action === 'edit' || action === 'delete') out[action] = minLevel(level, view);
        }
        result[module.key] = out;
    }
    return result;
}

/** Every action on every module at `level` (`own` only where offered, else `all`). */
export function uniformPermissions(level: AccessLevel): RolePermissions {
    const raw: Record<string, Record<string, AccessLevel>> = {};
    for (const module of PERMISSION_MODULES) {
        raw[module.key] = {};
        for (const action of module.actions) {
            raw[module.key][action] = level === 'own' && !levelsFor(module, action).includes('own') ? 'all' : level;
        }
    }
    return normalizePermissions(raw);
}

/** Full access: every action on every record (Super Admin, and roles that saw everything before Admin › Roles). */
export const FULL_PERMISSIONS: RolePermissions = uniformPermissions('all');
/**
 * Own records only, creating, exporting and importing allowed: every other role before Admin › Roles. Referrals were listed to
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

/** How the editor names a level: Yes / No for Create, Export and Import; All / Own / None otherwise. */
export function levelLabel(action: PermissionAction, level: AccessLevel): string {
    if (YES_NO_ACTIONS.has(action)) return level === 'none' ? 'No' : 'Yes';
    return level === 'all' ? 'All' : level === 'own' ? 'Own' : 'None';
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
