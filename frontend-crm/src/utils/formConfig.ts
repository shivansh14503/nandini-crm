import type {
    ConfiguredSection,
    CrmModuleKey,
    DropdownCategoryDto,
    FormConfigsPayload,
    FormFieldDefinitionDto,
} from '@/types/formConfig.types';

/**
 * Pure helpers over the admin form configuration, shared by hooks, the FormConfig context, form resolvers and
 * the admin builder. Archived options / fields are kept in the payload so stored values still resolve.
 */

export const CUSTOM_FIELDS_KEY = 'customFields';

/** RHF name a configured field binds to: built-in fields by key, custom fields under `customFields`. */
export const fieldFormName = (field: Pick<FormFieldDefinitionDto, 'fieldKey' | 'isSystem'>): string =>
    field.isSystem ? field.fieldKey : `${CUSTOM_FIELDS_KEY}.${field.fieldKey}`;

export function findCategory(configs: FormConfigsPayload | null | undefined, key: string | null | undefined): DropdownCategoryDto | undefined {
    if (!configs || !key) return undefined;
    return configs.categories.find((c) => c.key === key);
}

/** Active option values in admin order; `fallback` while the configuration hasn't loaded (or the key is unknown). */
export function activeOptionValues(category: DropdownCategoryDto | undefined, fallback: readonly string[] = []): string[] {
    if (!category) return [...fallback];
    return category.options
        .filter((o) => o.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => o.value);
}

/** value → display label for every option (archived included), only where the label differs from the value. */
export function optionLabelMap(category: DropdownCategoryDto | undefined): Record<string, string> | undefined {
    if (!category) return undefined;
    const map: Record<string, string> = {};
    for (const option of category.options) if (option.label && option.label !== option.value) map[option.value] = option.label;
    return Object.keys(map).length > 0 ? map : undefined;
}

export function moduleFields(configs: FormConfigsPayload | null | undefined, module: CrmModuleKey): FormFieldDefinitionDto[] {
    return [...(configs?.fieldsByModule[module] ?? [])].filter((f) => !f.isDeleted).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Like moduleFields, but keeps deleted (tombstoned) built-in fields, so the hand-built forms know to hide them. */
export function allModuleFieldsIncludingDeleted(configs: FormConfigsPayload | null | undefined, module: CrmModuleKey): FormFieldDefinitionDto[] {
    return [...(configs?.fieldsByModule[module] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Groups fields into sections (in order of each section's first field), optionally for one tab. */
export function groupSections(fields: FormFieldDefinitionDto[], tabKey?: string): ConfiguredSection[] {
    const sections = new Map<string, ConfiguredSection>();
    for (const field of [...fields].sort((a, b) => a.sortOrder - b.sortOrder)) {
        if (tabKey && field.tabKey !== tabKey) continue;
        const key = `${field.tabKey}::${field.sectionKey}`;
        let section = sections.get(key);
        if (!section) {
            section = { sectionKey: field.sectionKey, sectionLabel: field.sectionLabel, tabKey: field.tabKey, fields: [] };
            sections.set(key, section);
        }
        section.fields.push(field);
    }
    return [...sections.values()];
}

export function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function readPath(values: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), values);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

/** Format check for a filled custom field value; returns an error message or undefined. */
export function validateCustomValue(field: FormFieldDefinitionDto, value: unknown): string | undefined {
    if (isEmptyValue(value)) return undefined;
    const text = typeof value === 'string' ? value.trim() : String(value);
    switch (field.fieldType) {
        case 'email':
            return EMAIL_PATTERN.test(text) ? undefined : `${field.label} must be a valid email address.`;
        case 'phone':
            return E164_PATTERN.test(text) ? undefined : `${field.label} must be a valid phone number with country code.`;
        case 'number':
            return NUMBER_PATTERN.test(text) ? undefined : `${field.label} must be a number.`;
        case 'amount':
            return /^\d+(\.\d{1,2})?$/.test(text) ? undefined : `${field.label} must be a non-negative amount with up to 2 decimals.`;
        case 'percentage': {
            const n = Number(text);
            return NUMBER_PATTERN.test(text) && n >= 0 && n <= 100 ? undefined : `${field.label} must be between 0 and 100.`;
        }
        case 'pincode':
            return /^[A-Za-z0-9\s-]{2,12}$/.test(text) ? undefined : `${field.label} must be a valid PIN / postal code.`;
        case 'text':
        case 'uppercase':
            return text.length > 500 ? `${field.label} cannot exceed 500 characters.` : undefined;
        case 'textarea':
            return text.length > 4000 ? `${field.label} cannot exceed 4000 characters.` : undefined;
        default:
            return undefined;
    }
}

export interface ConfigValidationIssue {
    /** RHF path, e.g. `customFields.cf_region` or `designation`. */
    path: string;
    message: string;
}

/**
 * Admin rules on top of a form's zod schema: required custom fields, required built-in fields the admin made
 * mandatory, and custom field formats. Hidden and archived fields are never required (stored values pass).
 */
export function validateConfiguredFields(
    configs: FormConfigsPayload | null | undefined,
    module: CrmModuleKey,
    values: unknown,
): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    for (const field of moduleFields(configs, module)) {
        if (!field.isActive || !field.isVisibleInForm) continue;
        const path = fieldFormName(field);
        const value = readPath(values, path);
        if (field.isRequired) {
            const isCheckbox = field.fieldType === 'checkbox';
            if (isCheckbox ? value !== true : isEmptyValue(value)) {
                issues.push({ path, message: isCheckbox ? `${field.label} must be checked.` : `${field.label} is required.` });
                continue;
            }
        }
        if (!field.isSystem) {
            const message = validateCustomValue(field, value);
            if (message) issues.push({ path, message });
        }
    }
    return issues;
}

/** Parses a custom field's stored default (`defaultValue` is text) into the control's value shape. */
export function parseDefaultValue(field: FormFieldDefinitionDto): unknown {
    const raw = field.defaultValue?.trim();
    if (!raw) return undefined;
    if (field.fieldType === 'checkbox') return raw === 'true' || raw === 'Yes' || raw === '1';
    if (field.fieldType === 'multiselect') return raw.split(',').map((v) => v.trim()).filter(Boolean);
    if (field.fieldType === 'date' && raw.toLowerCase() === 'today') return new Date().toISOString().slice(0, 10);
    return raw;
}

/** Display text for a custom field value in drawers / read-only views. */
export function formatCustomValue(field: FormFieldDefinitionDto, value: unknown, labels?: Record<string, string>): string {
    if (isEmptyValue(value)) return '';
    const label = (v: string) => labels?.[v] ?? v;
    if (Array.isArray(value)) return value.map((v) => label(String(v))).join(', ');
    if (field.fieldType === 'checkbox') return value === true || value === 'true' ? 'Yes' : 'No';
    if (field.fieldType === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (field.fieldType === 'amount' && value !== '' && !Number.isNaN(Number(value))) {
        return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    }
    if (field.fieldType === 'percentage') return `${String(value)}%`;
    return label(String(value));
}
