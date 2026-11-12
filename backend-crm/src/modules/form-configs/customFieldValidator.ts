import { StatusCodes } from 'http-status-codes';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import type { CrmModuleKey } from './formConfig.defaults.js';
// Type-only: the service (and with it the Prisma client and env checks) is loaded on first use, so the pure checks
// below import cleanly in unit tests.
import type { FormConfigsPayload, FormFieldDefinitionDto } from './formConfig.service.js';

/**
 * Server-side enforcement of the admin form configuration (Settings → Form customization), so the rules the
 * frontend applies in `validateConfiguredFields` (frontend-crm/src/utils/formConfig.ts) also hold for API clients,
 * stale tabs and imports:
 *
 *  • `isRequired` on active, visible fields: custom fields (`customFields.cf_*`) and built-in fields an admin made
 *    mandatory. Checkboxes must be checked. Hidden and archived fields are never required, matching the form.
 *  • Custom field formats per `fieldType` (same patterns as the frontend), and `validationRules`
 *    (`min`, `max`, `minLength`, `maxLength`, `pattern`) where an admin set them.
 *  • Select / multi-select custom fields: values must be active options of the linked dropdown. A value already
 *    stored on the record stays valid after its option is archived, so old records remain editable.
 *  • `customFields` keys that aren't a custom field of the module are dropped. Values of archived custom fields
 *    are kept untouched (the configuration keeps archived fields so stored values still render).
 *
 * Errors use the form's RHF paths (`['customFields', 'cf_region']`, `['designation']`) so the field is highlighted.
 */

export const CUSTOM_FIELD_PREFIX = 'cf_';
const CUSTOM_FIELDS_KEY = 'customFields';

export interface ModuleFieldConfig {
    module: CrmModuleKey;
    /** The module's fields, archived included, built-in tombstones excluded. */
    fields: readonly FormFieldDefinitionDto[];
    /** Active option values by dropdown category id. */
    activeOptions: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface PayloadCheckOptions {
    /**
     * Keys the caller actually submitted. When given (updates, imports), `isRequired` is only enforced for those
     * built-in keys, and for custom fields only when `customFields` was submitted, so a partial update (e.g. a
     * kanban stage change) isn't blocked by a field made required after the record was created. Formats, rules and
     * options are always checked. Omit it on create, where every required field is enforced.
     */
    submittedKeys?: ReadonlySet<string>;
    /**
     * The record's stored custom field values (updates). Unchanged values skip the format / rule / option checks
     * (stored values pass, as in the form), and values of since-archived options stay valid.
     */
    previousCustomFields?: Record<string, unknown>;
}

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

// ── Configuration ────────────────────────────────────────────────────────────

export function buildModuleFieldConfig(configs: FormConfigsPayload, module: CrmModuleKey): ModuleFieldConfig {
    const fields = (configs.fieldsByModule[module] ?? []).filter((f) => !f.isDeleted);
    const activeOptions = new Map<string, Set<string>>();
    for (const category of configs.categories) {
        activeOptions.set(category.id, new Set(category.options.filter((o) => o.isActive).map((o) => o.value)));
    }
    return { module, fields, activeOptions };
}

/**
 * The module's configuration from `formConfigService`'s cache (archived rows included, so archived custom field
 * values can be told apart from unknown keys). Load it before opening a transaction: on a cache miss it queries
 * through the shared client, which shouldn't wait on a pool connection while the transaction holds one.
 */
export async function loadModuleFieldConfig(module: CrmModuleKey): Promise<ModuleFieldConfig> {
    const { formConfigService } = await import('./formConfig.service.js');
    return buildModuleFieldConfig(await formConfigService.getAllConfigs(true), module);
}

// ── Value checks ─────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const PINCODE_PATTERN = /^[A-Za-z0-9\s-]{2,12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const MAX_TEXT = 500;
const MAX_TEXTAREA = 4000;
/** Admin-entered patterns longer than this are ignored rather than compiled. */
const MAX_PATTERN_LENGTH = 200;

export function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

const isScalar = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const asText = (value: unknown) => (typeof value === 'string' ? value.trim() : String(value));

/** Format check for a filled custom field value, mirroring the frontend's `validateCustomValue`. */
function formatError(field: FormFieldDefinitionDto, value: unknown): string | undefined {
    const { label } = field;
    if (field.fieldType === 'multiselect') {
        return Array.isArray(value) && value.every((v) => typeof v === 'string') ? undefined : `${label} must be a list of options.`;
    }
    if (field.fieldType === 'checkbox') return typeof value === 'boolean' ? undefined : `${label} must be checked or unchecked.`;
    if (!isScalar(value)) return `${label} has an invalid value.`;

    const text = asText(value);
    switch (field.fieldType) {
        case 'email':
            return EMAIL_PATTERN.test(text) ? undefined : `${label} must be a valid email address.`;
        case 'phone':
            return E164_PATTERN.test(text) ? undefined : `${label} must be a valid phone number with country code.`;
        case 'number':
            return NUMBER_PATTERN.test(text) ? undefined : `${label} must be a number.`;
        case 'amount':
            return AMOUNT_PATTERN.test(text) ? undefined : `${label} must be a non-negative amount with up to 2 decimals.`;
        case 'percentage': {
            const n = Number(text);
            return NUMBER_PATTERN.test(text) && n >= 0 && n <= 100 ? undefined : `${label} must be between 0 and 100.`;
        }
        case 'pincode':
            return PINCODE_PATTERN.test(text) ? undefined : `${label} must be a valid PIN / postal code.`;
        case 'date':
            return DATE_PATTERN.test(text) && !Number.isNaN(Date.parse(text)) ? undefined : `${label} must be a valid date.`;
        case 'text':
        case 'uppercase':
        case 'select':
            return text.length > MAX_TEXT ? `${label} cannot exceed ${MAX_TEXT} characters.` : undefined;
        case 'textarea':
            return text.length > MAX_TEXTAREA ? `${label} cannot exceed ${MAX_TEXTAREA} characters.` : undefined;
        default:
            return undefined;
    }
}

const ruleNumber = (rules: Record<string, unknown>, key: string): number | undefined => {
    const raw = rules[key];
    if (raw === null || raw === undefined || raw === '') return undefined;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : undefined;
};

const NUMERIC_TYPES = new Set(['number', 'amount', 'percentage']);

function compilePattern(source: unknown): RegExp | undefined {
    if (typeof source !== 'string' || !source || source.length > MAX_PATTERN_LENGTH) return undefined;
    try {
        // Anchored so a pattern describes the whole value, as an HTML `pattern` attribute does.
        return new RegExp(`^(?:${source})$`, 'u');
    } catch {
        return undefined;
    }
}

/** `validationRules` an admin set on a field (min / max / minLength / maxLength / pattern). */
function ruleError(field: FormFieldDefinitionDto, value: unknown): string | undefined {
    const rules = field.validationRules;
    if (!rules) return undefined;
    const { label } = field;

    const min = ruleNumber(rules, 'min');
    const max = ruleNumber(rules, 'max');
    if ((min !== undefined || max !== undefined) && isScalar(value)) {
        if (NUMERIC_TYPES.has(field.fieldType)) {
            const n = Number(asText(value));
            if (Number.isFinite(n)) {
                if (min !== undefined && n < min) return `${label} must be at least ${min}.`;
                if (max !== undefined && n > max) return `${label} must be at most ${max}.`;
            }
        }
    }
    if (field.fieldType === 'date' && typeof value === 'string') {
        const day = value.slice(0, 10);
        const minDate = typeof rules.min === 'string' ? rules.min.slice(0, 10) : undefined;
        const maxDate = typeof rules.max === 'string' ? rules.max.slice(0, 10) : undefined;
        if (minDate && day < minDate) return `${label} cannot be before ${minDate}.`;
        if (maxDate && day > maxDate) return `${label} cannot be after ${maxDate}.`;
    }

    const length = Array.isArray(value) ? value.length : isScalar(value) ? asText(value).length : undefined;
    const unit = Array.isArray(value) ? 'selections' : 'characters';
    const minLength = ruleNumber(rules, 'minLength');
    const maxLength = ruleNumber(rules, 'maxLength');
    if (length !== undefined && minLength !== undefined && length < minLength) return `${label} must have at least ${minLength} ${unit}.`;
    if (length !== undefined && maxLength !== undefined && length > maxLength) return `${label} cannot exceed ${maxLength} ${unit}.`;

    const pattern = compilePattern(rules.pattern);
    if (pattern) {
        const texts = Array.isArray(value) ? value.map(asText) : isScalar(value) ? [asText(value)] : [];
        if (texts.some((t) => !pattern.test(t))) {
            return typeof rules.patternMessage === 'string' && rules.patternMessage ? rules.patternMessage : `${label} is not in the expected format.`;
        }
    }
    return undefined;
}

/** Select / multi-select values must be active options, or values the record already stored. */
function optionError(field: FormFieldDefinitionDto, value: unknown, previous: unknown, config: ModuleFieldConfig): string | undefined {
    if (!field.dropdownCategoryId) return undefined;
    const options = config.activeOptions.get(field.dropdownCategoryId);
    // A deleted category has no options to check against; the stored value is kept as-is.
    if (!options) return undefined;
    const asOptions = (v: unknown) => (Array.isArray(v) ? v : [v]).filter(isScalar).map(String);
    const kept = new Set(asOptions(previous));
    const invalid = asOptions(value).filter((v) => !options.has(v) && !kept.has(v));
    if (invalid.length === 0) return undefined;
    return field.fieldType === 'multiselect'
        ? `${field.label}: "${invalid.join('", "')}" ${invalid.length === 1 ? 'is not an available option' : 'are not available options'}.`
        : `${field.label}: "${invalid[0]}" is not an available option.`;
}

/** Normalizes a valid value to the shape its control produces. */
function normalizeValue(field: FormFieldDefinitionDto, value: unknown): unknown {
    if (field.fieldType === 'uppercase' && typeof value === 'string') return value.toUpperCase();
    return value;
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * Checks a payload against a module's configuration. `payload` is the record in form shape (the request body on
 * create, stored record merged with the patch on update); `customFields` is the parsed custom field bag.
 * Returns the custom fields to store (unknown keys dropped); throws 400 `VALIDATION_ERROR` listing every issue.
 */
export function checkModulePayload(
    config: ModuleFieldConfig,
    payload: Record<string, unknown>,
    customFields: Record<string, unknown> | undefined,
    options: PayloadCheckOptions = {},
): Record<string, unknown> {
    const { submittedKeys, previousCustomFields } = options;
    const input = customFields ?? {};
    const issues: ApiFieldError[] = [];
    const customDefs = new Map<string, FormFieldDefinitionDto>();

    for (const field of config.fields) {
        const isCustom = !field.isSystem;
        if (isCustom) customDefs.set(field.fieldKey, field);
        if (!field.isActive || !field.isVisibleInForm) continue;

        const path = isCustom ? [CUSTOM_FIELDS_KEY, field.fieldKey] : [field.fieldKey];
        const value = isCustom ? input[field.fieldKey] : payload[field.fieldKey];
        const requiredApplies = !submittedKeys || submittedKeys.has(isCustom ? CUSTOM_FIELDS_KEY : field.fieldKey);

        if (field.isRequired && requiredApplies) {
            const isCheckbox = field.fieldType === 'checkbox';
            if (isCheckbox ? value !== true : isEmptyValue(value)) {
                issues.push({ path, message: isCheckbox ? `${field.label} must be checked.` : `${field.label} is required.` });
                continue;
            }
        }
        if (isEmptyValue(value)) continue;
        // Values the write doesn't change were accepted when stored; re-checking them would block unrelated edits.
        const unchanged = isCustom
            ? previousCustomFields !== undefined && sameValue(value, previousCustomFields[field.fieldKey])
            : submittedKeys !== undefined && !submittedKeys.has(field.fieldKey);
        if (unchanged) continue;

        const message =
            (isCustom ? formatError(field, value) : undefined) ??
            ruleError(field, value) ??
            (isCustom && (field.fieldType === 'select' || field.fieldType === 'multiselect')
                ? optionError(field, value, previousCustomFields?.[field.fieldKey], config)
                : undefined);
        if (message) issues.push({ path, message });
    }

    if (issues.length > 0) {
        throw new HttpError(issues[0].message, StatusCodes.BAD_REQUEST, { code: 'VALIDATION_ERROR', errors: issues });
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        const field = customDefs.get(key);
        if (!field || !key.startsWith(CUSTOM_FIELD_PREFIX)) continue;
        sanitized[key] = field.isActive ? normalizeValue(field, value) : value;
    }
    return sanitized;
}

/**
 * Loads the module's cached configuration and checks the payload (see `checkModulePayload`). Pass a preloaded
 * `config` when calling inside a transaction or once per row of a bulk write.
 */
export async function validateModulePayload(
    module: CrmModuleKey,
    payload: Record<string, unknown>,
    customFields: Record<string, unknown> | undefined,
    options: PayloadCheckOptions & { config?: ModuleFieldConfig } = {},
): Promise<Record<string, unknown>> {
    const config = options.config ?? (await loadModuleFieldConfig(module));
    return checkModulePayload(config, payload, customFields, options);
}

/** Request bodies arrive as `unknown`; anything but a plain object reads as `{}` (the schema already rejected it). */
export const asPayload = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
