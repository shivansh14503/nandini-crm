import type { NextFunction, Request, Response } from 'express';
import type { TransactionClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpError } from '../../utils/httpError.js';
import { countRecordsWithKey, fieldKeyFormatError, MODULE_TABLES, parsePreviousKeys } from './fieldKeyRename.js';
import type { CrmModuleKey } from './formConfig.defaults.js';

/**
 * TEMP-DEV-RENAME: admin renaming of API names, open wide while the app is being built (remove before production).
 *
 * Any field's API name may be changed by an admin:
 * - a custom field's API name is its storage key (`fieldKey`), so a rename moves its stored values (fieldKeyRename.ts);
 *   it no longer needs the `cf_` prefix;
 * - a built-in field's `fieldKey` is the database column the code reads, so it never changes; the admin's name is
 *   stored as `apiName`, record writes accept it in place of the column name, and the column name always works.
 *
 * A rename is final: the old name is forgotten (no aliases are kept). Only what would break saves is refused: a name
 * that isn't a plain identifier, a name another field of the module already has, and (built-in fields) a name a
 * record already uses for another property. Everything else (look-alike names, a deleted field's leftover values,
 * old names that stop working) is a warning the admin may save through.
 */

export const API_NAME_MAX = 80;
/** Kept as an alias of `API_NAME_MAX` for the validator. */
export const BUILT_IN_API_NAME_MAX = API_NAME_MAX;

/** Properties every record payload / response may carry that are not form fields, plus JavaScript object internals. */
const ALWAYS_RESERVED = [
    'id',
    'customFields',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'isDeleted',
    'deletedAt',
    'deletedBy',
    'version',
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
];

const lower = (s: string) => s.toLowerCase();

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** The fields of one module, as stored (the shape both the DB rows and the config DTOs share). */
export interface ApiNameField {
    id: string;
    fieldKey: string;
    label: string;
    isSystem: boolean;
    apiName: string | null;
    previousFieldKeys: string[];
}

/** The API name a field is known by: a built-in field's admin-chosen name, else its key. */
export const apiNameOf = (f: Pick<ApiNameField, 'fieldKey' | 'apiName' | 'isSystem'>) => (f.isSystem && f.apiName ? f.apiName : f.fieldKey);

/** A built-in field's accepted name → its column. `current`: the field's API name now (else an old one). */
export type BuiltInNameMap = ReadonlyMap<string, { column: string; current: boolean }>;

/**
 * API name (current, or an old one recorded before renames became final) → column name, for the module's built-in
 * fields. A name that is a column name (any built-in field's key) is never translated.
 */
export function buildBuiltInNameMap(fields: readonly ApiNameField[]): BuiltInNameMap {
    const builtIns = fields.filter((f) => f.isSystem);
    const columns = new Set(builtIns.map((f) => f.fieldKey));
    const map = new Map<string, { column: string; current: boolean }>();
    for (const f of builtIns) {
        for (const old of f.previousFieldKeys) if (!columns.has(old)) map.set(old, { column: f.fieldKey, current: false });
    }
    for (const f of builtIns) if (f.apiName && !columns.has(f.apiName)) map.set(f.apiName, { column: f.fieldKey, current: true });
    return map;
}

/**
 * A record payload with values sent under a built-in field's API name moved to the field's column name. A value sent
 * under the column name itself wins (the app's own forms send it), then one under the current API name.
 */
export function resolveBuiltInApiNames(body: Record<string, unknown>, names: BuiltInNameMap): Record<string, unknown> {
    if (names.size === 0 || !Object.keys(body).some((k) => names.has(k))) return body;
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) if (!names.has(key)) resolved[key] = value;
    const named = Object.entries(body)
        .filter(([key]) => names.has(key))
        .sort(([a], [b]) => Number(names.get(b)!.current) - Number(names.get(a)!.current));
    for (const [key, value] of named) {
        const { column } = names.get(key)!;
        if (!Object.hasOwn(resolved, column)) resolved[column] = value;
    }
    return resolved;
}

export interface ApiNameCheck {
    /** Blocks the change: saving it would break writes. */
    error: string | null;
    /** Saving is allowed, but the admin should know. */
    warnings: string[];
}

/** Database facts the pure check needs (passed in so it stays testable). */
export interface ApiNameContext {
    /** Properties a record of the module already has (built-in renames only). */
    reserved?: ReadonlySet<string>;
    /** Custom fields: records holding a value under the requested name left by a deleted field. */
    leftovers?: number;
    /** Custom field renames: records whose value under the current name moves to the new one. */
    moving?: number;
}

/**
 * What saving `requested` as the API name of `field` (undefined: a new custom field) would do among the module's
 * `fields`.
 */
export function checkApiName(field: ApiNameField | undefined, requested: string, fields: readonly ApiNameField[], ctx: ApiNameContext = {}): ApiNameCheck {
    const result: ApiNameCheck = { error: null, warnings: [] };
    const current = field ? apiNameOf(field) : null;
    if (requested === current) return result;
    const fail = (message: string) => ({ ...result, error: message });

    const formatError = fieldKeyFormatError(requested);
    if (formatError) return fail(formatError);
    const builtIn = Boolean(field?.isSystem);
    const others = fields.filter((f) => f.id !== field?.id);

    // Two fields answering to one name would make writes, imports and the builder ambiguous (and a custom key equal
    // to another field's key breaks the module's unique key). A built-in field may always go back to its column.
    if (!(builtIn && requested === field!.fieldKey)) {
        const owner = others.find((f) => f.fieldKey === requested || apiNameOf(f) === requested);
        if (owner) return fail(`'${requested}' is already the API name of '${owner.label}'.`);
        // Writes translate names by exact case, so only the exact property name collides.
        if (builtIn && ctx.reserved?.has(requested)) {
            return fail(`Records already have a '${requested}' property, so writes using it would go to the wrong place. Choose another name.`);
        }
    }

    const lookAlike = others.find((f) => lower(f.fieldKey) === lower(requested) || lower(apiNameOf(f)) === lower(requested));
    if (lookAlike) result.warnings.push(`'${apiNameOf(lookAlike)}' (${lookAlike.label}) differs only in upper / lower case; easy to mix up.`);
    if (!builtIn && ctx.leftovers) {
        result.warnings.push(
            `${ctx.leftovers} record${ctx.leftovers === 1 ? '' : 's'} still hold${ctx.leftovers === 1 ? 's' : ''} a value under '${requested}' from a deleted field; it will show up in this field.`,
        );
    }
    if (field && !builtIn && ctx.moving !== undefined) {
        result.warnings.push(
            ctx.moving > 0
                ? `Saving moves this field's value on ${ctx.moving} record${ctx.moving === 1 ? '' : 's'} to the new name.`
                : 'No record holds a value for this field yet, so no data moves.',
        );
    }
    if (field && current && current !== requested && !(builtIn && current === field.fieldKey)) {
        result.warnings.push(
            builtIn
                ? `'${current}' stops working when you save; anything still sending it must switch to '${requested}'. The column name '${field.fieldKey}' always works.`
                : `'${current}' stops working when you save: forms left open, import files and integrations using it must switch to '${requested}'.`,
        );
    }
    return result;
}

// ── Reserved names ───────────────────────────────────────────────────────────

/** The keys a zod schema accepts at the top level (objects, through preprocess / transform pipes and wrappers). */
function schemaKeys(schema: unknown, out: Set<string>, depth = 0): void {
    if (!schema || typeof schema !== 'object' || depth > 6) return;
    const s = schema as { shape?: Record<string, unknown>; in?: unknown; out?: unknown; options?: unknown[]; _zod?: { def?: { innerType?: unknown } } };
    if (s.shape && typeof s.shape === 'object') for (const key of Object.keys(s.shape)) out.add(key);
    if (s.in) schemaKeys(s.in, out, depth + 1);
    if (s.out) schemaKeys(s.out, out, depth + 1);
    if (Array.isArray(s.options)) for (const option of s.options) schemaKeys(option, out, depth + 1);
    if (s._zod?.def?.innerType) schemaKeys(s._zod.def.innerType, out, depth + 1);
}

/** Each module's record input schema (loaded lazily: the module validators import form-config code). */
const INPUT_SCHEMAS: Record<CrmModuleKey, () => Promise<unknown>> = {
    leads: async () => (await import('../leads/lead.validator.js')).leadInputSchema,
    opportunities: async () => (await import('../opportunities/opportunity.validator.js')).opportunityInputSchema,
    quotations: async () => (await import('../quotations/quotation.validator.js')).quotationInputSchema,
    organizations: async () => (await import('../organizations/organization.validator.js')).organizationInputSchema,
    contacts: async () => (await import('../contacts/contact.validator.js')).contactInputSchema,
    products: async () => (await import('../products/product.validator.js')).productInputSchema,
    tickets: async () => (await import('../tickets/ticket.validator.js')).ticketInputSchema,
    'partner-companies': async () => (await import('../partner-companies/partnerCompany.validator.js')).partnerCompanyInputSchema,
};

const reservedCache = new Map<CrmModuleKey, ReadonlySet<string>>();

/**
 * Names a built-in API name may not take in the module: every column of its table and every property its
 * record payload accepts. Translating such a name would swallow a value meant for that property.
 */
export async function reservedRecordNames(module: CrmModuleKey): Promise<ReadonlySet<string>> {
    const cached = reservedCache.get(module);
    if (cached) return cached;
    const names = new Set<string>(ALWAYS_RESERVED);
    const columns = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${MODULE_TABLES[module].table}ScalarFieldEnum`];
    for (const column of Object.keys(columns ?? {})) names.add(column);
    schemaKeys(await INPUT_SCHEMAS[module](), names);
    reservedCache.set(module, names);
    return names;
}

// ── Database work ────────────────────────────────────────────────────────────

async function moduleFields(tx: TransactionClient, module: CrmModuleKey): Promise<ApiNameField[]> {
    const rows = await tx.formFieldDefinition.findMany({
        where: { module },
        select: { id: true, fieldKey: true, label: true, isSystem: true, apiName: true, previousFieldKeysJson: true },
    });
    return rows.map((r) => ({ ...r, previousFieldKeys: parsePreviousKeys(r.previousFieldKeysJson) }));
}

/**
 * Takes the module's field rows under an update lock, so two API name changes in one module are checked one after
 * the other (otherwise both could pass the clash check and end up with the same name).
 */
export async function lockModuleFields(tx: TransactionClient, module: CrmModuleKey): Promise<void> {
    await tx.$queryRaw(Prisma.sql`SELECT [id] FROM [dbo].[FormFieldDefinition] WITH (UPDLOCK, HOLDLOCK) WHERE [module] = ${module}`);
}

/**
 * `checkApiName` against the stored fields: used by the admin form's live preview (`POST /form-configs/api-name-check`)
 * and again when the change is saved. `fieldId` omitted: a new custom field.
 */
export async function previewApiName(tx: TransactionClient, module: CrmModuleKey, fieldId: string | undefined, requested: string): Promise<ApiNameCheck> {
    const fields = await moduleFields(tx, module);
    const field = fieldId ? fields.find((f) => f.id === fieldId) : undefined;
    if (fieldId && !field) throw HttpError.notFound('Form field not found');
    if (field && requested === apiNameOf(field)) return { error: null, warnings: [] };
    if (field?.isSystem) return checkApiName(field, requested, fields, { reserved: await reservedRecordNames(module) });
    const formatOk = !fieldKeyFormatError(requested);
    return checkApiName(field, requested, fields, {
        leftovers: formatOk ? await countRecordsWithKey(tx, module, requested) : 0,
        moving: field ? await countRecordsWithKey(tx, module, field.fieldKey) : undefined,
    });
}

/** `previewApiName`, refusing (409, at `path`) when the name is blocked. */
export async function assertApiNameAllowed(tx: TransactionClient, module: CrmModuleKey, fieldId: string | undefined, requested: string, path: string): Promise<void> {
    const { error } = await previewApiName(tx, module, fieldId, requested);
    if (error) throw HttpError.conflict(error, [{ message: error, path: [path] }]);
}

// ── Record writes ────────────────────────────────────────────────────────────

/**
 * Express middleware for a module's create / update routes: a body sending built-in fields under their API names is
 * rewritten to the column names before the module validates it.
 */
export function acceptBuiltInApiNames(module: CrmModuleKey) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const body: unknown = req.body;
            if (body && typeof body === 'object' && !Array.isArray(body)) {
                const { loadModuleFieldConfig } = await import('./customFieldValidator.js');
                const { builtInNames } = await loadModuleFieldConfig(module);
                if (builtInNames && builtInNames.size > 0) req.body = resolveBuiltInApiNames(body as Record<string, unknown>, builtInNames);
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}
